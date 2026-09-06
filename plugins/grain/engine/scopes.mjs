// grain engine · extractScopes — the extraction pipeline itself: one walk of one file's AST into scopes and their predicates
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { basename, dirname, extname } from 'node:path/posix';
import { S } from './base.mjs';
import {
  CONTAINER_RE,
  CTOR_LIKE_RE,
  ENUM_LIKE_RE,
  ENUM_MEMBER_RE,
  FUNC_LIKE_RE,
  FUNC_VALUE_RE,
  STR_TYPES,
  TYPE_LIKE_RE,
  TYPE_REF_ID_TYPES,
  VAL_CAP,
  VAL_SCAN_CAP,
  declaratorChain,
  declaredTypeParams,
  hasPrimaryCtor,
  heritageNamesOf,
  isKeyNode,
  isLocationNode,
  keyPathOf,
  looseBody,
  memberOrder,
  modifiersOf,
  nameSuffix,
  scopeName,
} from './extract.mjs';
import { lexicalPreds } from './lexical.mjs';
import { hashStr, macroParser, nameShape, resolveImport, tokenize } from './parse.mjs';
import { blockScope, docTokens, exportShape, skelOf } from './superposition.mjs';

// `_depth` is the macro-body recursion level (§018 phase 2, in the else-branch below), never passed by a caller.
export function extractScopes(rel, tree, b, grammar = null, _depth = 0) {
  const scopes = [];
  const imports = [];
  const isScope = n => b.scope.has(n.type);
  // §075 — a catch/finally clause's collection below searches bodyN's WHOLE subtree (descendantsOfType does not
  // stop at a nested scope's own boundary), so the SAME physical clause is found once when its enclosing METHOD
  // is walked and again when that method's enclosing CLASS is walked (and again for every further ancestor up
  // the chain) — one clause in the source, one scope entry per body-bearing ancestor above it. The walk visits an
  // ancestor strictly before any of its descendants (a scope's own catch/finally loop runs before its children
  // are pushed onto `treeStack`), so the NEAREST enclosing scope always claims a given clause LAST. Keying each
  // claim by the clause's own node id and letting a later claim overwrite an earlier one — instead of pushing a
  // second `scopes` entry — leaves exactly one entry per physical clause, claimed by its nearest enclosing scope,
  // regardless of nesting depth or grammar (no per-language special case: purely a fact about tree structure).
  const catchOwnerIdx = new Map();
  // iterative pre-order, left-to-right traversal (no call-stack frame per AST level — a recursive `walk` overflowed
  // the stack on a deeply left-nested `binary_expression`, one JS frame per operator): children are pushed in
  // REVERSE order so the first child pops first, preserving the exact visitation order `scopes` array order,
  // decoration attribution and the same-name ordinal disambiguation all depend on
  const pushKids = (node, stack) => {
    const kids = node.namedChildren;
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]);
  };
  // §016 — the type a callable declares itself bound to. The receiver is a list of `paramLike` NAMED SLOTS, so the
  // type is read off the slot's own `.type` field: taking the first identifier instead would record the receiver's
  // BINDING NAME (`c` in `func (c *Context) …`), the same name-vs-type confusion §G26 fixed for named returns.
  const ownerFor = ch => {
    if (!b.rcvCallable.has(ch.type)) return null;
    const rf = ch.childForFieldName('receiver');
    const slot = rf && rf.namedChildren.find(c2 => b.paramLike.has(c2.type));
    const tn = slot && slot.childForFieldName('type');
    if (!tn) return null;
    const id = tn.descendantsOfType(TYPE_REF_ID_TYPES)[0] || tn;
    const t2 = id.text.replace(/^[*&]+/, '').replace(/<.*$/, '');
    return t2 && t2.length <= 40 ? t2 : null;
  };
  const treeStack = [];
  pushKids(tree.rootNode, treeStack);
  while (treeStack.length) {
    const ch = treeStack.pop();
    // §060 — the malformed node itself is never a declaration (its own boundary is garbage), but tree-sitter's
    // error recovery routinely parses PART of what falls inside an ERROR node into fully clean, correctly-typed
    // children — a nested `package … { }` holding a well-formed `object` sits right next to a Scala class whose
    // `@Inject()`-annotated curried constructor the grammar can't parse (Play framework's braced-package idiom,
    // the same root cause §053 measured). Skipping descent entirely dropped that object and every method inside
    // it with no disclosure. Push the error node's own children so the walk keeps going, exactly as it does for
    // any other non-scope node — a MISSING node has no children, so this is a no-op for it; a doubly-broken child
    // is still an ERROR/MISSING node itself and is skipped on its own next pop. Nothing is ever extracted from
    // the ERROR node itself, only from descendants the grammar already typed with zero errors of their own — no
    // re-parse, no guess about what the broken span "should" mean, same zero-fabrication instinct as §018.
    if (ch.isError) pushKids(ch, treeStack);
    if (ch.isError || ch.isMissing) continue;
    if (b.imp.has(ch.type)) {
      // every string inside the import node (Go's grouped imports hold one per spec); else the first name-like child
      const strs = ch
        .descendantsOfType([
          'string',
          'string_literal',
          'interpreted_string_literal',
          'raw_string_literal',
          'system_lib_string',
        ])
        .map(n => n.text.replace(/^["'`<]|["'`>]$/g, ''))
        .filter(Boolean);
      let tgts = strs.length ? [...new Set(strs)] : [];
      if (!tgts.length) {
        let tgt = ch.namedChildren.find(c =>
          /dotted_name|scoped_identifier|qualified_name|namespace_name|identifier|package|use_list|use_clause/.test(
            c.type
          )
        )?.text;
        if (tgt && /use_list|use_clause/.test(ch.namedChildren.find(c => c.text === tgt)?.type || ''))
          tgt = tgt.replace(/\s+/g, '').replace(/::\{.*$/, '');
        if (tgt) tgts = [tgt];
      }
      for (const tgt of tgts) {
        const r = resolveImport(tgt, rel);
        if (!imports.includes(r)) imports.push(r);
      }
      // the children of an import node (import_specifier, named_imports …) are the SAME logical import — descending would
      // re-match /import/ and record every imported identifier as a module (measured: `files here import \`Command\``)
      if (!isScope(ch)) continue;
    }
    if (isScope(ch)) {
      if (isLocationNode(ch.type)) {
        pushKids(ch, treeStack);
        continue;
      } // a namespace/package/mod statement names a location, not a unit of code
      // a property accessor (C# `get`/`set`/`init`) is named by a keyword and belongs to its property — mined as methods, 40 accessors
      // certified "methods here are named a single lowercase word" and flagged every real method of the directory (measured on CleanArchitecture)
      if (/accessor/.test(ch.type)) {
        pushKids(ch, treeStack);
        continue;
      }
      // §040 — a DECLARATOR-NAMED scope (one the grammar names through a `declarator` field rather than a `name`
      // field) whose declarator chain declares NO `parameters` anywhere is not a callable: a callable's name and
      // its parameter list come from the same declarator, so a chain without one never spelled a function. Two
      // ways a grammar lands here, both told apart by the node's OWN `type` field:
      //   · that field holds a BODY-LESS type-declaring specifier — the shape a class declaration collapses into
      //     when an unparsed token sits between the keyword and the name (`class <token> Foo { … }`, an export or
      //     visibility macro). The grammar recovers `class <token>` as the "return type" and `Foo` as the
      //     "function name", so the REAL name is already in the declarator, where `scopeName` reads it, and the
      //     token is only ever the specifier's own name — which is never read. It is a type, not a method.
      //   · anything else — a range-for's loop variable, a definition whose name the grammar could not recover.
      //     Nothing here is a declaration this file can name, so record none of it and keep walking into it,
      //     exactly as a location node above does; whatever nests inside is still extracted on its own terms.
      // Confined to C/C++ by the grammars themselves: they are the only two shipped grammars that declare a
      // body-plus-declarator scope node at all, so no other language can move. No macro is named anywhere.
      let recoveredType = false;
      if (
        !ch.childForFieldName('name') &&
        ch.childForFieldName('declarator') &&
        !declaratorChain(ch).some(d => d.childForFieldName('parameters'))
      ) {
        const tf = ch.childForFieldName('type');
        if (tf && TYPE_LIKE_RE.test(tf.type) && !tf.childForFieldName('body')) recoveredType = true;
        else {
          pushKids(ch, treeStack);
          continue;
        }
      }
      const name = scopeName(ch);
      const bodyN = ch.childForFieldName('body') || (b.loosebody.has(ch.type) ? looseBody(ch) : null);
      // a bodiless declaration (C# positional record, Kotlin data class, interface method signature, forward declaration) is
      // a scope for identity surfaces — name, decorations, supertypes, return type — but has no behaviour to mine
      const noBody = !bodyN;
      // kind by syntax category (class/struct/record/enum/interface/trait/object… ⇒ type) rather than by nesting alone: a
      // Python class with only fields and a TS interface are types, a JS function holding callbacks is still a method —
      // the container/leaf rule confused all three in every language of the corpus
      const typeLike =
        recoveredType || (TYPE_LIKE_RE.test(ch.type) && !/(?:^|_)expression(?:_|$)/.test(ch.type));
      const hasChildScope = bodyN
        ? bodyN
            .descendantsOfType([...b.scope])
            .some(
              d =>
                !isLocationNode(d.type) &&
                (d.childForFieldName('body') || (b.loosebody.has(d.type) && looseBody(d)))
            )
        : false;
      const kind = typeLike || (hasChildScope && !FUNC_LIKE_RE.test(ch.type)) ? 'type' : 'method';
      // constructor shape (types only): does the type declare its constructor's parameters in its OWN header
      // (`primary`, hasPrimaryCtor above) or as a nested classic member (`classic`, CTOR_LIKE_RE), both, or
      // neither — computed here (before the bodiless early-return below) so a bodiless primary-constructor
      // declaration (C# positional record `record Foo(int X);`) is not silently excluded from this fact
      const ctorShape =
        kind !== 'type'
          ? undefined
          : (() => {
              const hasPrimary = hasPrimaryCtor(ch);
              const hasClassic = bodyN ? bodyN.namedChildren.some(c => CTOR_LIKE_RE.test(c.type)) : false;
              return hasPrimary && hasClassic
                ? 'both'
                : hasPrimary
                  ? 'primary'
                  : hasClassic
                    ? 'classic'
                    : 'none';
            })();
      // supKind (§033): a name's classification as 'ext' (genuine inheritance) or 'impl' (interface conformance),
      // wherever the grammar's own clause node type says so — the dedicated `superclasses` field (Python: no
      // interfaces, always inheritance-shaped) and heritageRe's generic `argument_list` match are never classified
      // by anything more specific than that, so their names stay 'ext' below, unchanged from before this fact existed.
      const sup = [];
      const supKind = {};
      // the leaf identifier-shaped node types a heritage clause is scanned for, MINUS any that this grammar's
      // OWN node-types.json shows to be a `b.qualName` WRAPPER rather than a leaf (§062): Java's
      // `scoped_type_identifier` (`com.google.inject.AbstractModule`) and, one grammar's coincidence with
      // another, C#'s OWN unrelated `qualified_name` (`Ns.Base` — kept in this list unfiltered for PHP, whose
      // *different* node type of the same name is not a `b.qualName` wrapper and gets its own dedicated
      // backslash-split handling below). Matching a wrapper type directly would capture its own full dotted
      // text wholesale — the same bug this fixes one level down. Its actual leaf (`type_identifier`/
      // `generic_name`/…) is still found, and resolved to just the tail, via the ordinary leaf types below.
      const heritageIdTypes = [
        'identifier',
        'type_identifier',
        'property_identifier',
        'private_property_identifier',
        'constant',
        'name',
        'qualified_name',
        'relative_name',
      ].filter(t => !b.qualName.has(t));
      const heritageIdTypeSet = new Set(heritageIdTypes);
      // §082: Python's dedicated `superclasses` field routed through `heritageNamesOf` too — the same §062
      // leaf-only resolution every other grammar's qualified heritage name already gets — so a dotted base
      // (`class Foo(pkg.sub.Type)`) records only the resolved leaf (`Type`), never `pkg` and `pkg.sub` as well.
      const sc = ch.childForFieldName('superclasses');
      if (sc)
        for (const { nm } of heritageNamesOf(sc, b, heritageIdTypes, heritageIdTypeSet)) {
          sup.push(nm);
          supKind[nm] = 'ext';
        }
      // which field holds each child, so a heritage-shaped clause can be told from a CONSTRUCTOR CALL by the name
      // the grammar gives the slot: Python's base list is `class_definition.superclasses` (an argument_list that IS
      // the parent specification), Java/Groovy's is `enum_constant.arguments` (a call, carrying no heritage at all)
      const fieldOf = new Map();
      for (let i = 0; i < ch.childCount; i++) {
        const fn = ch.fieldNameForChild(i);
        if (fn) fieldOf.set(ch.child(i).id, fn);
      }
      for (const c2 of ch.namedChildren)
        if (
          b.heritageRe.test(c2.type) &&
          !(bodyN && c2.id === bodyN.id) &&
          !b.argRe.test(fieldOf.get(c2.id) || '')
        )
          for (const { nm, hKind } of heritageNamesOf(c2, b, heritageIdTypes, heritageIdTypeSet)) {
            sup.push(nm);
            if (hKind && !(nm in supKind)) supKind[nm] = hKind;
          }
      // decoration attribution: the stack of decoration siblings directly above this scope (any height, comments allowed in
      // between) plus decorations inside the scope's own pre-body subtree (Java/C# modifiers, parameter annotations). Never a
      // preceding member's stack (the walk stops at the first real sibling) and never anything inside the body.
      const decos = [];
      const decoLits = []; // string-literal ARGUMENTS of the decorations: routes, event names, DI tokens — the marker's meaning
      if (b.deco.size) {
        // linear: walk back over decoration/comment siblings (the stack), then scan the scope's own pre-body subtree
        const decoTypes = [...b.deco];
        const limit = bodyN ? bodyN.startIndex : ch.endIndex;
        // the sigil travels with the name: `[Test]` (C#), `#[Test]` (PHP) and `@Test` (Java/Kotlin) are different
        // tokens and render as written. §054b: `#[` is the same category of sigil as `@` and `[` — a decoration
        // marker, not a PHP special case — so it is matched by character pattern here exactly like the other two.
        // §043 — a decoration may also be written with NO sigil at all (Solidity's modifiers: `onlyOwner`), in which case
        // the whole text is a bare name, optionally applied to an argument list, and renders bare. Admitted ONLY for the
        // node types `b.decoBare` holds — the structurally-derived ones — because the node-type-NAME vocabulary that
        // fills the rest of `b.deco` matches only constructs every shipped grammar writes with a sigil, and reading
        // bare text for those swallows a modifier KEYWORD that happens to share the node type's name (measured: Kotlin's
        // `annotation` in `annotation class Foo` became a decoration called `annotation`). Anchored on the ENTIRE text
        // too, never a prefix, so a bare name followed by anything else is not a decoration either.
        const take = d => {
          const t = d.text.trimStart();
          const m = /^(?:#\[|[@[])/.test(t)
            ? t.match(/^(?:#\[|[@[])\s*([\w.]+)/)
            : b.decoBare.has(d.type)
              ? t.match(/^([A-Za-z_$][\w.$]*)\s*(?:\(|$)/)
              : null;
          if (m) {
            decos.push(t.startsWith('#[') ? '#[' + m[1] + ']' : t[0] === '[' ? '[' + m[1] + ']' : m[1]);
            if (decoLits.length < 12)
              for (const lm of t.matchAll(/["'`]([^"'`\n]{1,60})["'`]/g)) decoLits.push(lm[1]);
          }
        };
        let sib = ch.previousNamedSibling;
        while (sib && (b.deco.has(sib.type) || sib.type === 'comment')) {
          if (b.deco.has(sib.type)) take(sib);
          sib = sib.previousNamedSibling;
        }
        for (const d of ch.descendantsOfType(decoTypes)) if (d.startIndex < limit) take(d);
        decos.reverse();
      }
      const params =
        ch.childForFieldName('parameters') ||
        declaratorChain(ch)
          .map(d => d.childForFieldName('parameters'))
          .find(Boolean);
      const nP = params ? params.namedChildren.length : 0;
      const ptypes = [];
      if (params && kind === 'method')
        for (const prm of params.namedChildren.slice(0, 8)) {
          const tn = prm.childForFieldName('type');
          if (!tn) continue;
          const id = tn.descendantsOfType([
            'type_identifier',
            'predefined_type',
            'primitive_type',
            'scoped_type_identifier',
            'qualified_type',
            'attribute',
            'dotted_name',
            'identifier',
            'name',
          ])[0];
          const tx = (id ? id.text : tn.text).replace(/^[:\s]+/, '').replace(/\s+/g, '');
          if (tx && tx.length <= 40 && /^[\w.$:\\]+$/.test(tx) && !ptypes.includes(tx))
            ptypes.push(tx.split('\\').pop());
        }
      // declared result type — the field name is DERIVED per node type (§bindingFor's `b.retField`: Go `result`,
      // TS/PHP/Rust/Scala `return_type`, Java/Groovy/C# `type`, C# `method_declaration`'s own `returns`), never a
      // hardcoded alternative list. The named identifiers of that type: for typed languages without decorators
      // this is the strongest role signal there is (measured on gin: middlewares are the functions returning
      // `HandlerFunc`, and nothing else names them)
      const rets = [];
      const retFieldName = b.retField.get(ch.type);
      const retN = retFieldName ? ch.childForFieldName(retFieldName) : null;
      const RET_ID_TYPES = TYPE_REF_ID_TYPES;
      if (retN && !(bodyN && retN.id === bodyN.id)) {
        // a NAMED-RESULT node — Go `func f() (err error)`'s `parameter_list`, Scala 3's named-tuple return
        // `(name: String, age: Int)`'s `named_tuple_type`: every one of retN's OWN direct children is a `paramLike`
        // "named slot" (both a `name` field and a `type` field, §bindingFor). `err`/`name`/`age` are BINDING NAMES,
        // not types — reading each slot's `.type` field directly (same technique as `ptypes` above) is the only way
        // to name the type without also naming the variable/element bound to it (§G26 bugfix: the flat identifier
        // scan below previously found the NAME first, since it sits before the TYPE in source order, and recorded
        // the name as if it were the return type — `(err error)` came out as "returns err", not "returns error")
        const namedSlots =
          b.paramLike.size &&
          retN.namedChildCount > 0 &&
          retN.namedChildren.every(c => b.paramLike.has(c.type))
            ? retN.namedChildren.slice(0, 8)
            : null;
        if (namedSlots) {
          for (const slot of namedSlots) {
            const tn = slot.childForFieldName('type');
            if (!tn) continue;
            const id = tn.descendantsOfType(RET_ID_TYPES)[0];
            const tx = (id ? id.text : tn.text).replace(/^[:\s]+/, '').replace(/\s+/g, '');
            if (tx && tx.length <= 40 && /^[\w.$:\[\]]+$/.test(tx) && !rets.includes(tx)) rets.push(tx);
          }
        } else {
          // the outer type name only: `Promise<void>` → Promise, `Page<Owner>` → Page, `: boolean` → boolean
          // NOT extended to a paramLike node nested (not as a direct child) inside an otherwise-ordinary return
          // type — e.g. a TS return type that is itself a function type, `(x: number) => void`, still surfaces
          // `x`. That is the same name-vs-type confusion, diagnosed alongside this fix, but deliberately left
          // unfixed here: excluding such a slot's `.name` field does not even reach it (TS's plain-identifier
          // `required_parameter` binds through a `pattern` field, not `name`, despite node-types.json listing
          // `name` as a valid field too — a per-grammar quirk, not a stable generic signal), and excluding the
          // whole slot (name AND type) regressed real, common code instead: a TS return type that is an object
          // literal, `{ id: string }`, is ALSO `paramLike` per property, and dropping its `.type` field silently
          // discarded a real, previously-reported type (measured: broke this repo's own change-archetypes/
          // missing-shape fixtures). Reported as a known, narrower, un-fixed gap rather than shipped fragile.
          const id = retN.descendantsOfType(RET_ID_TYPES)[0]; // pre-order: `t.Any` before `t`
          const tx = (id ? id.text : retN.text).replace(/^[:\s]+/, '').replace(/\s+/g, '');
          if (tx && tx.length <= 40 && /^[\w.$:\[\]]+$/.test(tx)) rets.push(tx);
        }
      }
      const stmts = bodyN ? bodyN.namedChildren : [];
      let docText = '';
      {
        let sib = ch.previousNamedSibling,
          hops = 0;
        while (sib && hops++ < 6 && (b.deco.has(sib.type) || /comment/.test(sib.type))) {
          if (/comment/.test(sib.type)) {
            docText = sib.text;
            break;
          }
          sib = sib.previousNamedSibling;
        }
        if (
          !docText &&
          stmts.length &&
          stmts[0].type === 'expression_statement' &&
          stmts[0].namedChildCount === 1 &&
          /string/.test(stmts[0].namedChildren[0].type)
        )
          docText = stmts[0].namedChildren[0].text;
      }
      const doc = docTokens(docText);
      if (decoLits.length)
        for (const t of docTokens(decoLits.slice(0, 12).join(' '))) if (!doc.includes(t)) doc.push(t);
      const mods = modifiersOf(ch, b);
      // issue 125 — the type parameters THIS scope itself declares (`<T>`, `[T, +U]`), read off the scope's own
      // header only (never its body): a method's `ptype`/`returns` and a type's `extends` can name one of these
      // instead of a real domain type, and until now nothing distinguished the two (§120's class-2 guard could
      // only guess by name shape). Kept on every scope kind, not just `method`/`type` — a `noBody` interface
      // method still declares its own `<T>` in several grammars.
      const tparams = declaredTypeParams(ch, b);
      if (noBody) {
        scopes.push({
          kind,
          name,
          own: kind === 'method' ? ownerFor(ch) : null,
          rel,
          line: ch.startPosition.row + 1,
          endLine: ch.endPosition.row + 1,
          g: grammar,
          nt: ch.type,
          noBody: true,
          sup: [...new Set(sup)],
          supKind,
          decos: [...new Set(decos)],
          rets,
          tparams,
          calls: new Set(),
          seen: new Set(),
          shapes: new Set(),
          preds: Object.assign(
            { 'auto.mods': mods },
            name !== '<anon>'
              ? { 'auto.nameshape': nameShape(name), 'auto.namesuffix': nameSuffix(name) }
              : {},
            kind === 'type' ? { 'auto.ctorshape': ctorShape } : {}
          ),
          sk: skelOf(ch, isScope),
        });
        pushKids(ch, treeStack);
        continue;
      }
      const seen = new Set();
      const calls = new Set();
      const varNames = [];
      const stack = [...stmts];
      let g = 0;
      while (stack.length && g++ < 4000) {
        const n = stack.pop();
        seen.add(n.type);
        if (/call/.test(n.type) && n.childForFieldName('function')) {
          const fn = n.childForFieldName('function');
          if (fn.text.length <= 40 && !fn.text.includes('\n')) calls.add(fn.text);
        }
        if (
          n.type === 'variable_declarator' ||
          (n.type === 'assignment' && n.childForFieldName('left')?.type === 'identifier')
        ) {
          const nm = (n.childForFieldName('name') || n.childForFieldName('left'))?.text;
          if (nm) varNames.push(nm);
        }
        if (!isScope(n)) for (const c of n.namedChildren) stack.push(c);
      }
      const shapes = new Set();
      const ser = (n, d) =>
        d <= 0
          ? n.type
          : n.type +
            '(' +
            n.namedChildren
              .slice(0, 3)
              .map(c => ser(c, d - 1))
              .join(',') +
            ')';
      if (kind === 'method') for (const st of stmts.slice(0, 20)) shapes.add(ser(st, 2));
      const retStmts = stmts.filter(s => /return/.test(s.type));
      const preds = { 'auto.mods': mods };
      if (name !== '<anon>') {
        preds['auto.nameshape'] = nameShape(name);
        preds['auto.namesuffix'] = nameSuffix(name);
      } // a placeholder has no name shape (domain: named scopes)
      // placement is a property of every scope, not only of its file: the group cell (r<i>:type auto.dir2 = handlers) is what
      // makes "handlers live under src/handlers/" a checkable fact — measured: no dir fact ever fired in any corpus, because
      // dir preds sat on file scopes and file scopes have no groups
      dirname(rel)
        .split('/')
        .filter(sg => sg !== '.')
        .slice(0, 3)
        .forEach((sg, k) => (preds['auto.dir' + (k + 1)] = sg));
      if (kind === 'type') {
        preds['auto.ctorshape'] = ctorShape;
        preds['auto.memberorder'] = memberOrder(bodyN);
      } // bodiless types are excluded above: a type with no body has no member layout to order
      if (kind === 'method') {
        preds['auto.arity'] = nP >= 3 ? '3+' : String(nP);
        if (stmts.length >= 1) preds['auto.first1'] = stmts[0].type;
        if (retStmts.length)
          preds['auto.ret'] = retStmts[retStmts.length - 1].namedChildren[0]?.type || 'bare';
        if (varNames.length >= 2) {
          const c = {};
          for (const v of varNames.slice(0, 20)) {
            const sh = nameShape(v);
            c[sh] = (c[sh] || 0) + 1;
          }
          preds['auto.varshape'] = Object.entries(c).sort((a, x) => x[1] - a[1])[0][0];
        }
      }
      scopes.push({
        kind,
        name,
        own: kind === 'method' ? ownerFor(ch) : null,
        rel,
        line: ch.startPosition.row + 1,
        endLine: ch.endPosition.row + 1,
        g: grammar,
        nt: ch.type,
        sup: [...new Set(sup)],
        supKind,
        decos: [...new Set(decos)],
        rets,
        ptypes,
        tparams,
        calls,
        seen,
        shapes,
        preds,
        doc,
        sk: skelOf(ch, isScope),
      });
      // catch/finally micro-scopes: "catch blocks here call `logger.error`" is a convention no per-method surface carries
      // (a method's call bag cannot say WHERE the logging sits); the block is its own population, named after its owner
      if (bodyN)
        for (const blk of bodyN.descendantsOfType([
          'catch_clause',
          'except_clause',
          'rescue',
          'finally_clause',
          'ensure',
          'defer_statement',
        ])) {
          const bkind = /finally|ensure/.test(blk.type) ? 'finally' : 'catch';
          const blkScope = blockScope(blk, bkind, name === '<anon>' ? kind : name, rel, grammar, isScope);
          // §075 dedup (see the comment on `catchOwnerIdx` above): a later claim on the same physical clause
          // replaces the earlier one in place, rather than adding a second `scopes` entry beside it.
          if (catchOwnerIdx.has(blk.id)) scopes[catchOwnerIdx.get(blk.id)] = blkScope;
          else {
            catchOwnerIdx.set(blk.id, scopes.length);
            scopes.push(blkScope);
          }
        }
      pushKids(bodyN || ch, treeStack);
    } else {
      // a function on the right of an assignment is named by its left side: `const foo = () => {}`, `obj.prop = function () {}`
      // (only when the function itself is nameless — a named function expression is already a scope of its own)
      {
        const inner = ch.childForFieldName('value') || ch.childForFieldName('right');
        const innerHasBody =
          inner && !!(inner.childForFieldName('body') || (b.loosebody.has(inner.type) && looseBody(inner)));
        if (
          inner &&
          FUNC_VALUE_RE.test(inner.type) &&
          innerHasBody &&
          !inner.childForFieldName('name')?.text
        ) {
          const leftN = ch.childForFieldName('name') || ch.childForFieldName('left');
          const nm = leftN ? leftN.text.split('.').pop().trim() : '';
          if (nm && nm.length <= 40 && /^[A-Za-z_$][\w$]*$/.test(nm)) {
            const sc2 = blockScope(
              inner.childForFieldName('body') || inner,
              'method',
              nm,
              rel,
              grammar,
              isScope,
              ch.startPosition.row + 1,
              ch.endPosition.row + 1
            );
            sc2.nt = inner.type;
            sc2.preds['auto.nameshape'] = nameShape(nm);
            sc2.preds['auto.namesuffix'] = nameSuffix(nm);
            const prm = inner.childForFieldName('parameters');
            sc2.preds['auto.arity'] = prm
              ? prm.namedChildren.length >= 3
                ? '3+'
                : String(prm.namedChildren.length)
              : '0';
            scopes.push(sc2);
          }
        }
      }
      // a named callback block, from the raw AST shape alone: a call carrying a string literal AND a function argument
      // names the otherwise-anonymous callback — `it('strips the prefix', fn)`, `t.Run("name", func…)`, but equally
      // `app.get('/health', handler)` or `on('close', fn)`. No callee vocabulary; the shape is the signal.
      if (/call/.test(ch.type)) {
        const fn2 = ch.childForFieldName('function') || ch.namedChildren[0];
        if (fn2 && fn2.text.length <= 30) {
          const argsN = ch.childForFieldName('arguments') || ch;
          const strN = argsN.namedChildren.find(a =>
            /^(string|string_literal|interpreted_string_literal|raw_string_literal)$/.test(a.type)
          );
          const fnN = argsN.namedChildren.find(a =>
            /function|arrow|lambda|func_literal|closure|do_block|^block$/.test(a.type)
          );
          if (strN && fnN) {
            const nm = strN.text
              .replace(/^["'`]|["'`]$/g, '')
              .replace(/\s+/g, ' ')
              .slice(0, 60);
            if (nm)
              scopes.push(
                blockScope(
                  fnN.childForFieldName('body') || fnN,
                  'case',
                  nm,
                  rel,
                  grammar,
                  isScope,
                  ch.startPosition.row + 1,
                  ch.endPosition.row + 1
                )
              );
          }
        }
      }
      // §018 — a macro invocation's body is an UNPARSED TOKEN REGION (`b.macroCall`/`b.tokenRegion`, derived in
      // bindingFor): the grammar tokenised it and declined to give it structure, so every declaration written
      // inside is invisible — axum's `define_rejection! { pub struct JsonDataError(Error); }` yields a ~200-line
      // file with ZERO scopes and 15 missing public types. Ask the GRAMMAR ITSELF what those tokens are: re-parse
      // the region's own text and keep what comes back only if the WHOLE region parses cleanly (`hasError` false)
      // — the grammar's own verdict "these tokens are declarations", not a guess about what a macro emits, and no
      // macro is ever named. A body of bare references (`println!("{}", x)`, `matches!(x, Foo::Bar)`, `vec![a, b]`)
      // is not a parseable run of items and yields nothing, and neither does a template whose names are holes
      // (`quote! { struct #name; }`) or a syntax the language does not have (`bitflags! { pub struct F: u32 {…} }`).
      // Measured over 26k macro invocations in five Rust repositories: 96-99% of bodies are rejected outright, and
      // of the 828 names recovered NOT ONE was a name that is not literally declared at the line reported — the
      // inverse error, inventing a declaration, is the one this must never make (§018 phase 2 measurement log).
      if (b.macroCall.has(ch.type) && _depth < 2) {
        // 2: the same shallow recursion bound the walk's other guards use
        const reg = ch.namedChildren[ch.namedChildren.length - 1];
        const kids = reg && b.tokenRegion.has(reg.type) ? reg.children : null;
        const open = kids && kids.length > 2 ? kids[0] : null,
          close = kids && kids.length > 2 ? kids[kids.length - 1] : null;
        // the region's own delimiters are ANONYMOUS tokens; the body is exactly what lies between them
        if (open && !open.isNamed && !close.isNamed) {
          const inner = reg.text.slice(open.endIndex - reg.startIndex, close.startIndex - reg.startIndex);
          // `b.kwRe`: the body must name at least one of the grammar's OWN keyword tokens, or it cannot spell a
          // declaration. Over-approximate on purpose (a keyword inside a string counts) — it only decides whether
          // the parse is worth attempting; the parse itself is the verdict. Halves the cost, loses no name.
          const mp = inner.trim() && b.kwRe && b.kwRe.test(inner) ? macroParser(b) : null;
          if (mp) {
            const it = mp.parse(inner);
            // the body's first line CONTINUES the line the opening delimiter sits on, so every inner row is
            // offset by that row exactly — verified line-for-line against axum's rejection.rs
            if (!it.rootNode.hasError) {
              const row = open.endPosition.row;
              for (const s of extractScopes(rel, it, b, grammar, _depth + 1)) {
                if (s.kind === 'file') continue;
                s.line += row;
                if (s.endLine != null) s.endLine += row;
                scopes.push(s);
              }
            }
            it.delete();
          }
        }
      }
      pushKids(ch, treeStack);
    }
  }
  // loader calls as imports, for grammars whose module system is a function call (Ruby `require`, Lua `require`, PHP `require_once`,
  // Solidity-less) — module-level only: a `require` inside a function is a lazy load, not the file's dependency
  if (b.imp.size === 0 || /ruby|lua|php/.test(String(b.name))) {
    const LOADERS =
      /^(require|require_relative|require_once|include|include_once|load|dofile|import_module|using)$/;
    for (const c of tree.rootNode.descendantsOfType([
      'call',
      'call_expression',
      'function_call',
      'method_call',
      'function_call_expression',
      'include_expression',
      'require_expression',
      'require_once_expression',
    ])) {
      let p = c.parent,
        inScope = false;
      while (p) {
        if (isScope(p)) {
          inScope = true;
          break;
        }
        p = p.parent;
      }
      if (inScope) continue;
      const fn = c.childForFieldName('function') || c.childForFieldName('method') || c.namedChildren[0];
      if (!fn || !LOADERS.test(fn.text)) continue;
      const str = c.descendantsOfType(['string', 'string_literal', 'string_content'])[0];
      if (!str) continue;
      let tgt = str.text.replace(/^["'`]|["'`]$/g, '');
      if (/relative|once$/.test(fn.text) && !tgt.startsWith('.')) tgt = './' + tgt; // require_relative / require_once are file-relative
      if (tgt && !imports.includes(resolveImport(tgt, rel))) imports.push(resolveImport(tgt, rel));
    }
  }
  const fPreds = {
    'auto.filenameshape': nameShape(basename(rel, extname(rel))),
    ...lexicalPreds(tree, b),
    ...exportShape(tree),
  };
  // §045 — a macro invocation's own identifiers are a MENTION signal (macroDoc), never a HERITAGE claim: ~90%
  // of what the old `macroDefs` heuristic called "the definitions a macro emits" was either the invoked macro's
  // own name or a bare reference declared nowhere (measured on 5 real Rust repos, 5656 names, 85.5% phantom).
  // `fileSups` feeds `what`'s implements/extends claim, which a mention can never support — only `fileDocs` may
  // carry these tokens now.
  let macroDoc = [];
  if (b.macroCall.size) {
    const ids = [];
    for (const m of tree.rootNode.descendantsOfType([...b.macroCall]).slice(0, 60))
      for (const id of m.descendantsOfType(['identifier', 'type_identifier']).slice(0, 12)) {
        if (ids.length < 60) ids.push(id.text);
      }
    if (ids.length) macroDoc = docTokens([...new Set(ids)].join(' '));
  }
  dirname(rel)
    .split('/')
    .filter(s => s !== '.')
    .slice(0, 3)
    .forEach((s, k) => (fPreds['auto.dir' + (k + 1)] = s));
  // ===== VALUE CONCORDANCE (§J3.1): the values this file NAMES — enum members and short string literals — each
  // tagged with the container it sits in, so `learn()` can say where a value lives and which values are siblings.
  // Its OWN pass over the tree: the main walk above continues past import subtrees and descends only through scope
  // bodies, so none of this could ride along with it.
  const vals = [];
  const valSeen = new Set();
  let valsCapped = false;
  // `cn` is the container's DISPLAY name (an enum's own identifier), carried so §J3.2 can say "(added to `UserStatus`)" —
  // the container key itself is a hash and cannot be reversed. null for positional string containers, which have no name.
  const addVal = (v, k, line, c, cn) => {
    // dedupe per (v, k) BEFORE the cap: a value said five times in one file is one entry
    if (vals.length >= VAL_CAP) {
      valsCapped = true;
      return;
    } // a scan this file TRIED to exceed the cap on is a
    // non-representative PREFIX of itself (measured: vendored `tree-sitter-*.node-types.json`, `package-lock.json`)
    // — every `vals` entry collected so far for this file is dropped wholesale, below at the file-scope push
    if (!v || v.length > 80 || v.includes('\n')) return;
    const key = k + S + v;
    if (valSeen.has(key)) return;
    valSeen.add(key);
    vals.push({ v, k, line, c, cn: cn ?? null });
  };
  // (a) enum members: a child carrying a `name` field (C# enum_member_declaration, Java enum_constant, TS
  // enum_assignment) names itself; one that does not but IS identifier-shaped IS the name (TypeScript's bare
  // `enum UserStatus { ACTIVE, SUSPENDED }` members are `property_identifier` leaves with no field at all).
  // The container key is the enum's own NAME, not its position: the same enum declared in two files must be ONE
  // sibling set, which is the entire point of the sibling map.
  const enumTypes = [...b.nodeTypes].filter(t => ENUM_LIKE_RE.test(t));
  if (enumTypes.length)
    for (const en of tree.rootNode.descendantsOfType(enumTypes).slice(0, VAL_SCAN_CAP)) {
      const ebody = en.childForFieldName('body') || looseBody(en);
      if (!ebody) continue; // enum_body/enum_assignment match the word too — only a DECLARATION has a body
      const enName = en.childForFieldName('name');
      const c = hashStr(en.type + '|' + (enName ? enName.text : rel + '@' + en.startIndex));
      for (const m of ebody.namedChildren.slice(0, VAL_SCAN_CAP)) {
        const mn = m.childForFieldName('name');
        if (mn) addVal(mn.text, 'enum', m.startPosition.row + 1, c, enName ? enName.text : null);
        else if (ENUM_MEMBER_RE.test(m.type))
          addVal(m.text, 'enum', m.startPosition.row + 1, c, enName ? enName.text : null);
      }
    }
  // (a2) §014 — multi-name value specs with no body of their own (Go's `const_spec`/`var_spec`, §bindingFor's
  // `b.namedValueSpec`): a name with no behavior, exactly like an enum member above — never a scope (no body to
  // hold nested declarations; cross-check-honest-silence.test.mjs's own precondition asserts this stays true), but
  // findable through the same VALUE surface. The container is the spec's own PARENT (the `const_declaration` /
  // `var_declaration` / `var_spec_list` wrapping it), so a grouped `const ( A; B )` block's members share one
  // sibling set the same way one enum's members already do; single-line `const x = 1` gets a container of one.
  if (b.namedValueSpec.size)
    for (const sp of tree.rootNode.descendantsOfType([...b.namedValueSpec]).slice(0, VAL_SCAN_CAP)) {
      const names = sp.childrenForFieldName('name').filter(nm => nm.isNamed);
      if (!names.length) continue;
      const kind = sp.type.replace(/_spec$/, ''); // the grammar's own word for what this is ('const_spec' -> 'const') — not an invented label
      const cont = sp.parent || sp;
      const c = hashStr(cont.type + '|' + rel + '@' + cont.startIndex);
      for (const nm of names) addVal(nm.text, kind, nm.startPosition.row + 1, c, null);
    }
  // (b) string literals outside imports (a module specifier is a path, not a value). The container key is
  // POSITIONAL, which only means anything within one file — hence the path in the hash, so two files that happen
  // to open the same construct at the same offset are not merged into one bogus sibling set.
  for (const sn of tree.rootNode.descendantsOfType(STR_TYPES).slice(0, VAL_SCAN_CAP)) {
    // data grammars (JSON/YAML/TOML) have no code-style quote PREFIX (`f"…"`, `r'…'`) to strip — the shared
    // leading-letter strip below would mistake a bare YAML plain scalar's own leading word for one (`ubuntu-latest`
    // -> `-latest`), so a data file's own values only ever lose a surrounding quote character, never a prefix
    const v = b.data
      ? sn.text.replace(/^["'`]|["'`]$/g, '')
      : sn.text.replace(/^[A-Za-z@$]+/, '').replace(/^["'`]|["'`]$/g, '');
    if (!v || v.length > 40 || v.includes('\n')) continue;
    let p = sn.parent,
      cont = null,
      inImport = false;
    while (p) {
      if (b.imp.has(p.type)) {
        inImport = true;
        break;
      }
      // §056: `b.dataContainer` is consulted ONLY for a data grammar (b.data) — a code grammar's container
      // detection is exactly CONTAINER_RE, byte-for-byte unchanged, even though b.dataContainer's own derivation
      // above is structural enough to also match some code-grammar object/dict/map-literal container types
      // (JS/Python's already covered by CONTAINER_RE's "object"/"dictionary" anyway; Go/Ruby's are not, and are
      // deliberately left as they were — this ticket's own measurement covers data grammars only).
      if (!cont && (CONTAINER_RE.test(p.type) || (b.data && b.dataContainer.has(p.type)))) cont = p;
      p = p.parent;
    }
    if (inImport) continue;
    // a data-grammar node that IS the key of its pair (not the value) is tagged `key` — a genuine cross-file fact
    // ("the key `test` appears in these N files") through the existing valueIndex, keyed globally by `k:v`
    const k = b.data && isKeyNode(sn, b) ? 'key' : 'str';
    // §J7.3: a DATA container's identity is its key-PATH (`$.scripts`), not its file+offset — so the SAME
    // conceptual container (every package.json's own `scripts` object) is ONE population across files. `grammar`
    // is folded into the hash purely for belt-and-suspenders: `cont.type` alone already disambiguates a JSON
    // `object` from a code `object` in practice, but this makes that guarantee explicit. A code container (or a
    // data value with no container at all) keeps the existing positional/file-fallback keying, byte-for-byte.
    const keyPath = cont && b.data ? keyPathOf(cont, b) : null;
    const contId = hashStr(
      keyPath != null
        ? cont.type + '|' + grammar + '#' + keyPath
        : cont
          ? cont.type + '|' + rel + '@' + cont.startIndex
          : 'file|' + rel
    );
    addVal(v, k, sn.startPosition.row + 1, contId, keyPath);
  } // no container: the file itself is one
  scopes.push({
    kind: 'file',
    name: basename(rel),
    rel,
    line: 1,
    g: grammar,
    sup: [],
    decos: [],
    rets: [],
    calls: new Set(),
    seen: new Set(),
    shapes: new Set(),
    preds: fPreds,
    doc: macroDoc,
    vals: valsCapped ? [] : vals,
  });
  const occ = new Map(); // ordinal disambiguates same-named scopes of a kind within one file (overloads, repeated nested classes)
  for (const s of scopes) {
    const k = s.kind + S + s.name;
    const n = occ.get(k) || 0;
    s.ord = n;
    occ.set(k, n + 1);
  }
  for (const s of scopes) {
    s.imports = imports;
    // parameter types are a FACT surface, not a clustering feature: every handler takes its own `XCommand`, and putting
    // `pt:` into the bags split same-role scopes apart (measured on the fixture: the deviant fell out of its group)
    s.feats = [
      ...new Set([
        ...tokenize(s.name).map(t => 'tok:' + t),
        ...s.sup.map(x => 'sup:' + x),
        ...s.decos.map(d => 'dec:' + d),
        ...(s.rets || []).map(x => 'ret:' + x),
        ...(s.own ? ['own:' + s.own] : []),
        ...[...new Set(imports.filter(i => !i.startsWith('~/')).map(i => i.split('/').pop()))]
          .slice(0, 5)
          .map(x => 'imp:' + x),
      ]),
    ];
    s.ownCount = new Set([...tokenize(s.name), ...s.sup, ...s.decos, ...(s.rets || [])]).size;
  }
  return scopes;
}
