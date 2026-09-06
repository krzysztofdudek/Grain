// grain engine · generic language binding derived from each grammar's node-types.json, the parser pool, and the file/token primitives
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { Parser, Language } from './vendor/web-tree-sitter/web-tree-sitter.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { dirname, extname } from 'node:path/posix';
import { GRAMMAR_DIR, EXT2GRAMMAR, EXT_ALT, EXCL, MINE_EXCL } from './config.mjs';
import { CODE_RE, toPosix } from './base.mjs';

// ===== GENERIC BINDING: derived from the grammar's node-types.json — no per-language code =====
export const bindings = {};
export function bindingFor(gname) {
  if (bindings[gname]) return bindings[gname];
  const nt = JSON.parse(readFileSync(join(GRAMMAR_DIR, `tree-sitter-${gname}.node-types.json`), 'utf8'));
  const b = {
    scope: new Set(),
    loosebody: new Set(),
    imp: new Set(),
    deco: new Set(),
    decoBare: new Set(),
    keyField: new Set(),
    nodeTypes: new Set(nt.map(n => n.type)),
    // the ANONYMOUS half of nodeTypes: node-types.json marks every entry `named: true|false`, and an unnamed entry's
    // `.type` is the literal keyword or punctuation string it stands for (`public`, `static`, `{`). Extraction is
    // otherwise entirely `namedChildren`-based, so this is the only way a keyword token is visible at all (§auto.mods)
    anonTypes: new Set(nt.filter(n => n.named === false).map(n => n.type)),
    heritageRe:
      /heritage|extends|implements|superclass|super_interfaces|base_|superclasses|argument_list|interface_clause|delegation_specifier|inheritance_specifier|trait_bounds/,
    // two narrower refinements of heritageRe, for CLASSIFYING (never for finding) a heritage identifier as
    // inheritance-of-a-superclass or conformance-to-an-interface (§033) — read off the SAME structural node-type-name
    // vocabulary heritageRe/TYPE_LIKE_RE already use, never the language's identity. Verified per-grammar against each
    // shipped node-types.json: PHP's `base_clause`/`class_interface_clause`, Java/Groovy's `superclass`/`super_interfaces`
    // (plus `extends_interfaces`, an interface extending interfaces — still the `extends` keyword), and TS/TSX's
    // `extends_clause`/`extends_type_clause`/`implements_clause` are genuinely two distinct node types apiece.
    // Deliberately excluded: C#'s `base_list` (one undifferentiated list for the base class AND every implemented
    // interface — no syntactic marker at all) and Kotlin/Rust/Scala/Solidity's single shared heritage clause. Where
    // neither regex matches, the relationship is left unclassified and verbalize/deviationPhrase fall back to their
    // pre-existing "extends" wording — never a guess (§033 test: Go/Rust/Python byte-identical).
    extendsClauseRe:
      /^(?:superclass|extends_interfaces|base_clause|base_class_clause|extends_clause|extends_type_clause)$/,
    implementsClauseRe: /^(?:super_interfaces|class_interface_clause|implements_clause)$/,
    // a generic/template ARGUMENT list nested inside a heritage node (C# `type_argument_list`, Java/Kotlin/TS/Rust/Scala/Groovy
    // `type_arguments`, C++ `template_argument_list`): `AbstractValidator<TQuery>`'s `TQuery` is not a base type, it's a slot
    // filled with one — identifiers under this node are excluded from `sup`, never matched on a language's own type/class name
    genArgRe: /type_argument|template_argument/,
    // a CALL ARGUMENT list — the parenthesised operands of a call, never a type. `argument_list` sits in
    // heritageRe above for exactly one reason across every shipped grammar: Python holds a class's base list
    // in a `superclasses` FIELD that happens to BE an argument_list (`class Foo(Bar)`), so the token buys real
    // heritage there and nowhere else. Everywhere else an argument-shaped node reached from a heritage node is
    // the SUPER-CONSTRUCTOR CALL, in one of two roles, both noise:
    //   · it IS the clause, held in an argument-named field — Java/Groovy `enum_constant.arguments`;
    //   · it is NESTED inside a genuine parent clause, beside the type — Scala `extends AbstractController(cc)`,
    //     Kotlin `: B(x)`, C# `: Bar(x)`, Solidity `is B(x)`, C++ `: Base(x)`.
    // Which role applies is read off the FIELD NAME that holds the clause (heritage-named → parent
    // specification, argument-named → a call), so the type-named child of a clause always wins over its
    // argument list. Singular and plural both: Solidity's operands are `call_argument`, Kotlin's
    // `value_argument`, C#'s `argument`; `varargs`-style names (no separator) are deliberately not matched.
    argRe: /(^|_)arg(ument)?s?(_list)?$/,
    // a LIFETIME node — Rust's `'static`, `'a`, `'de`: a quote-prefixed identifier that names a lifetime,
    // never a trait or type. `trait_bounds` (already in `heritageRe`) lists `lifetime` as one of its own
    // child types right alongside `_type` (node-types.json), so `pub trait Handler: Clone + Send + Sync +
    // 'static` bounds a trait by four things and only three are traits — the ancestor walk finds `'static`'s
    // inner `identifier` exactly like it finds `Clone`'s, and nothing before this told them apart. Structurally
    // distinct from every real type: it declares no fields at all (`fields: {}`) and, unlike `type_identifier`/
    // `scoped_type_identifier`/…, it is not among `_type`'s own listed subtypes — it sits outside the type
    // hierarchy entirely, wrapping a bare `identifier` the same way a loop label does (Rust's `label` has the
    // identical shape, for the identical apostrophe syntax, and is irrelevant to heritage for the same reason).
    // A lifetime can also reach a heritage clause one level down — a generic bound's own `lifetime_parameter`
    // (`<'a: 'b>`) declares its `name` as a `lifetime` node, and `for_lifetimes` (`for<'a>`) lists `lifetime`
    // children directly — so excluding the ancestor node type, not just a direct parent, is what the
    // ancestor-walk in `heritageNamesOf` already does for `genArgRe`/`argRe`, applied here the same way. Named
    // literally (`lifetime`, not a language check): no other shipped grammar defines a node type of this name,
    // so this generalizes on its own to any future grammar that reuses the name for the same construct.
    lifetimeRe: /^lifetime$/,
    // a "named slot" node type — one whose OWN fields (per node-types.json) declare BOTH a `name` and a `type`:
    // Go's `parameter_declaration`/`variadic_parameter_declaration`, TS's `required_parameter`/`optional_parameter`,
    // Scala 3's `name_and_type` (named-tuple elements), C#'s `tuple_element`, and every ordinary function-parameter
    // node type besides. Used by return-type extraction (§auto.returns, below) to tell a BINDING NAME apart from a
    // TYPE reference wherever one of these sits inside a return-type expression — nothing here is Go- or Scala-
    // specific, it is the same field-driven derivation `b.scope`/`b.imp`/`b.deco` above already use (§G26 bugfix)
    paramLike: new Set(),
    // per-node-type declared-RESULT field name (§auto.returns, §021): a callable node (one with BOTH a `body`
    // and a `parameters` field) may declare its result under a field of its own choosing — Go `result`, TS/PHP/
    // Rust/Scala `return_type`, Java/Groovy/C# `type` — and, discovered the same way, C# `method_declaration`'s
    // own `returns`. Never a 4th hardcoded name: the field is found by asking node-types.json which of a
    // callable's OWN fields (besides its structural ones — body/name/parameters/type_parameters/receiver) admits
    // a "type"-shaped child, using the same word-bounded technique TYPE_LIKE_RE/FUNC_LIKE_RE already use elsewhere
    // (RESULT_FIELD_RE, defined below with those). Verified across every shipped grammar: exactly one such field
    // per callable node type, never zero-or-ambiguous (§014/§021 log).
    retField: new Map(),
    // §014 — node types shaped like a MULTI-NAME value binding with no body of its own (Go's const_spec/var_spec).
    // See the derivation rule below, in the main field loop.
    namedValueSpec: new Set(),
    // §016 — a callable that states, in its own signature, the NAMED TYPE it is bound to: a callable-shaped node
    // (its own `body` AND its own `parameters`) that ALSO declares its own `receiver` field. Derived, never named:
    // across every shipped grammar exactly one node type qualifies (Go's `method_declaration`) — Ruby's `call` also
    // declares a `receiver`, but has neither a body nor a parameter list of its own and so is correctly excluded.
    // Every OTHER language states the same binding by NESTING (a method inside its class/trait/impl), which is
    // already visible to extraction; this is the one shape where the binding would otherwise be invisible.
    rcvCallable: new Set(),
  };
  const RESULT_EXCLUDE = new Set(['body', 'name', 'parameters', 'type_parameters', 'receiver', 'attributes']);
  for (const n of nt) {
    const f = n.fields || {};
    // scope = a node with a body and a name — either a `name` field, or a `declarator` field that carries the name
    // (C/C++ function_definition: name lives in declarator → function_declarator → identifier). Still purely field-driven.
    if (f.body && (f.name || f.declarator)) b.scope.add(n.type);
    // grammars that name a node but keep its body as an unnamed child (Kotlin's class_declaration/function_declaration, …):
    // a named declaration/definition node is a scope when, at extraction time, one of its children is a body/block node
    else if (
      f.name &&
      !f.body &&
      /_(declaration|definition|decl|defn)$/.test(n.type) &&
      /^(class|function|method|object|interface|trait|struct|enum|module|impl|protocol|extension|companion|constructor|fun|func|def|proc|record|namespace|abstract_class|singleton)(_|$)/.test(
        n.type
      )
    ) {
      b.scope.add(n.type);
      b.loosebody.add(n.type);
    }
    if (/import|include|use_declaration|require/.test(n.type) && !n.type.startsWith('_')) b.imp.add(n.type);
    if (/decorator|annotation|attribute_list/.test(n.type)) b.deco.add(n.type);
    if (f.key) b.keyField.add(n.type);
    if (f.name && f.type) b.paramLike.add(n.type);
    if (f.body && f.parameters) {
      // callable-shaped: has its own body AND its own parameter list
      const cand = Object.keys(f).filter(
        k => !RESULT_EXCLUDE.has(k) && (f[k].types || []).some(t => RESULT_FIELD_RE.test(t.type))
      );
      if (cand.length === 1) b.retField.set(n.type, cand[0]);
    }
    // a MULTI-NAME value spec with no body (Go's `const_spec`/`var_spec`): one `name` field whose OWN cardinality
    // is `multiple` (it can bind SEVERAL identifiers — `a, b := f()` — to one shared `value`), never a scope
    // (no body field at all). This is the load-bearing, non-Go-specific test (§014): measured against every
    // shipped grammar's own name+value-no-body node (JS/TS `variable_declarator`, Python `keyword_argument`,
    // Rust `const_item`, PHP `enum_case`, …) — every one of those binds exactly ONE name; only Go's const/var
    // spec declares `name.multiple: true`, so this fires there and nowhere else, without naming Go.
    if (f.name && f.name.multiple && f.value && !f.body) b.namedValueSpec.add(n.type);
    if (f.body && f.parameters && f.receiver) b.rcvCallable.add(n.type);
  }
  // issue 125 — DECLARED TYPE PARAMETERS (`<T>`, `[T]`), derived from node-types.json alone, never a hand list of
  // languages: a node type is one type parameter's OWN declaration when its name contains the whole word segment
  // "type_parameter" (word-bounded, so this also matches Go's `type_parameter_declaration` and Scala's
  // `contravariant_type_parameter`/`covariant_type_parameter`, not just the bare TS/Java/Rust/C#/Kotlin/Groovy
  // `type_parameter`) and is not itself a LIST/CONSTRAINT/MODIFIER/CLAUSE wrapper attached to one — C#'s
  // `type_parameter_list`/`type_parameter_constraint`/`type_parameter_constraints_clause`, Kotlin's
  // `type_parameter_modifiers` name what BOUNDS or HOLDS a parameter, they never declare a fresh one. The LIST half
  // is the plural container every `type_parameters`-named field points at across TS/Java/Kotlin/Rust/Scala's own
  // node type `type_parameters`, or — where a grammar spells its list singularly instead ("_list") — the one node
  // type that carries that word (C#/Go's `type_parameter_list`). Measured against every shipped grammar: C++'s
  // declaration nodes have no such container at all (its own template-parameter list is named `template_...`, not
  // `type_...`) and Python overloads one node type ("type_parameter") for both the list and each entry — both are
  // left exactly as this derivation naturally leaves them (an empty/absent extraction there), never patched with a
  // language name to force a fit.
  const TPARAM_RE = wordBounded(['type_parameter']);
  const TPARAM_NONDECL_RE = wordBounded(['constraint', 'constraints', 'modifier', 'modifiers', 'list', 'clause']);
  b.tparamDecl = new Set(nt.filter(n => TPARAM_RE.test(n.type) && !TPARAM_NONDECL_RE.test(n.type)).map(n => n.type));
  b.tparamContainer = new Set(
    nt
      .filter(n => n.type === 'type_parameters' || (TPARAM_RE.test(n.type) && wordBounded(['list']).test(n.type)))
      .map(n => n.type)
  );
  // §018 phase 2 — an UNPARSED TOKEN REGION and the CALL that consists of one, both read off node-types.json:
  //   · a token region is a NAMED node type with no fields of its own whose own declared children include ITSELF
  //     — a nested, structureless run of tokens the grammar deliberately declined to analyse (Rust `token_tree`);
  //   · a macro-shaped call is a node type that is not one of those and whose EVERY declared non-field child is.
  // Measured against all 23 shipped node-types.json: `macroCall` is non-empty for exactly one grammar and names
  // exactly one node type there, so the other 22 grammars get no new behaviour whatsoever. No grammar, language
  // or macro is named anywhere — the same field-driven derivation `b.scope`/`b.namedValueSpec` already use.
  const tokRegion = new Set(
    nt
      .filter(
        n =>
          n.named !== false &&
          n.fields &&
          !Object.keys(n.fields).length &&
          n.children &&
          n.children.multiple &&
          (n.children.types || []).some(t => t.type === n.type)
      )
      .map(n => n.type)
  );
  b.tokenRegion = tokRegion;
  b.macroCall = new Set(
    nt
      .filter(
        n =>
          n.named !== false &&
          !tokRegion.has(n.type) &&
          n.children &&
          (n.children.types || []).length &&
          (n.children.types || []).every(t => tokRegion.has(t.type))
      )
      .map(n => n.type)
  );
  // the grammar's own KEYWORD vocabulary: the word-shaped half of anonTypes (`pub`, `struct`, `fn`), as opposed
  // to its punctuation (`{`, `;`, `=>`, `macro_rules!`). Every declaration in every shipped grammar is introduced
  // by one of these, so a token region whose text carries none of them cannot spell one — the pre-filter in
  // extractScopes below, which halves the re-parse cost without losing a single name anywhere on the corpus.
  const kw = [...b.anonTypes].filter(t => /^[A-Za-z_]\w*$/.test(t));
  b.kwRe = kw.length ? new RegExp('\\b(?:' + kw.join('|') + ')\\b') : null;
  // §043 — a SIGIL-LESS decoration, derived instead of named. The `/decorator|annotation|attribute_list/` match
  // above reads a node-type NAME; some grammars mark the same construct structurally instead, with a node type
  // whose name says nothing (Solidity's `modifier_invocation` — `onlyOwner`, `nonReentrant`: the language's
  // decorator equivalent, and the one that carries its access-control meaning). Read off node-types.json: a node
  // type is decoration-shaped when it is NAMED, declares no fields of its own, is listed among some SCOPE node's
  // own non-field children, is not already read as heritage (`b.heritageRe`), and its OWN declared children
  // include BOTH a name-shaped type and a call/argument-shaped one — "apply this named thing, with arguments,
  // to this declaration". That last conjunction is what carries the rule: it admits Solidity's
  // `modifier_invocation` (`[call_argument, identifier]`) while rejecting every neighbour that shares the same
  // position — a heritage list (names, no arguments: C#'s `base_list`, PHP's `base_clause`), a bare keyword
  // (Rust's `visibility_modifier`, Solidity's own `virtual`/`visibility`), a type constraint (C#'s
  // `type_parameter_constraints_clause`), and an argument list with nothing named (C#'s `constructor_initializer`,
  // C/C++'s `attribute_specifier`). Measured against all 23 shipped node-types.json: this adds exactly ONE node
  // type to exactly ONE grammar and nothing whatsoever to the other 22, so no other language's decorations move.
  // No modifier, language or grammar is named anywhere — the same derivation `b.macroCall` above already uses.
  const byType = new Map(nt.map(n => [n.type, n]));
  for (const s of b.scope) {
    const sn = byType.get(s);
    if (!sn || !sn.children) continue;
    for (const t of sn.children.types || []) {
      const c = byType.get(t.type);
      if (!c || c.named === false || b.deco.has(c.type) || b.heritageRe.test(c.type)) continue;
      if (c.fields && Object.keys(c.fields).length) continue;
      const kids = ((c.children && c.children.types) || []).map(x => x.type);
      if (kids.some(k => DECO_NAME_RE.test(k)) && kids.some(k => DECO_ARG_RE.test(k))) {
        b.deco.add(c.type);
        b.decoBare.add(c.type);
      }
    }
  }
  // §062 — QUALIFIED/MEMBER-NAME node types: `ns.Base` (JS/TS member_expression), a Java/Groovy FQN
  // (scoped_identifier/scoped_type_identifier), C#'s qualified_name, Kotlin's user_type/qualified_identifier,
  // Scala's stable_type_identifier, Ruby's scope_resolution, … Reading a compound name's identifiers naively
  // (every identifier-shaped DESCENDANT of a heritage clause) records the NAMESPACE half too — `extends
  // ethers.AbstractSigner` recorded `ethers`, never `AbstractSigner` (§049 fixed the analogous constructor-
  // argument shape; this is the member-access shape). A node type qualifies, without ever naming a language,
  // when its own field shape is a genuine two-part chain: exactly two "relevant" fields (its REQUIRED fields,
  // plus any OPTIONAL field that can itself carry a name-shaped value — Ruby's optional `scope`, absent on a
  // bare top-level `::Foo`), at least one of them PURELY name-shaped once its declared types are expanded
  // through the grammar's own supertype unions (member_expression's `property`, scoped_identifier's `name`,
  // qualified_name's `name`), and EVERY relevant field able to at least sometimes hold a name-shaped value (so
  // a declaration's unrelated `name` + `body` pair — body never holds a name — never qualifies). A fieldless
  // grammar (Java's scoped_type_identifier, Kotlin's user_type/qualified_identifier, Scala's
  // stable_type_identifier: node-types.json gives these no field names, only a shared repeatable CHILDREN
  // list) qualifies the same way through that list instead: more than one child allowed, and at least one of
  // the allowed child types is itself name-shaped. Measured to add no other grammar's declaration/expression
  // node types (a control-flow or binary-expression node's operands are typed too broadly — numbers, calls,
  // whole statements — to ever be "purely name-shaped").
  const qnMemo = new Map();
  const qnExpand = (t, seen) => {
    if (qnMemo.has(t)) return qnMemo.get(t);
    if (seen.has(t)) return new Set();
    seen.add(t);
    const out = new Set([t]);
    const entry = byType.get(t);
    if (entry && entry.subtypes) for (const s of entry.subtypes) for (const x of qnExpand(s.type, seen)) out.add(x);
    qnMemo.set(t, out);
    return out;
  };
  const qnExpandFields = types => {
    const out = new Set();
    for (const t of types) for (const x of qnExpand(t, new Set())) out.add(x);
    return out;
  };
  const qnAllNamey = set => {
    for (const t of set) if (!QUAL_NAME_LEAF_RE.test(t)) return false;
    return true;
  };
  const qnAnyNamey = set => {
    for (const t of set) if (QUAL_NAME_LEAF_RE.test(t)) return true;
    return false;
  };
  b.qualName = new Set();
  for (const n of nt) {
    const nf = n.fields || {};
    const fnames = Object.keys(nf);
    if (fnames.length) {
      const expOf = fn => qnExpandFields((nf[fn].types || []).map(t => t.type));
      const relevant = fnames.filter(fn => nf[fn].required !== false || qnAnyNamey(expOf(fn)));
      if (relevant.length === 2) {
        const expanded = relevant.map(expOf);
        if (expanded.some(qnAllNamey) && expanded.every(qnAnyNamey)) b.qualName.add(n.type);
      }
    } else if (n.children && n.children.multiple && (n.children.types || []).some(t => QUAL_NAME_LEAF_RE.test(t.type))) {
      b.qualName.add(n.type);
    }
  }
  // §083 — a TYPE-vs-EXPRESSION duality clause: a node type declaring no FIELDS of its own (node-types.json's
  // `fields` empty) whose only two possible unnamed children are exactly the two categories `type` and
  // `primary_expression` — Kotlin's own vocabulary for "a type reference" and "any expression". This is
  // Kotlin's `by`-delegation clause, `explicit_delegation` (`class Foo : Bar by expr`): `Bar` fills the TYPE
  // slot — real heritage — `expr` fills the DELEGATE slot, an arbitrary expression (a bare identifier, a
  // function call, …) that is never a supertype, whatever shape it takes. Checked against all 23 shipped
  // node-types.json: this exact two-element combination occurs nowhere else — not even elsewhere in Kotlin's
  // own grammar, where every other fields-less node pairing `type` with something else pairs it with a
  // DIFFERENT second category (`value_arguments`, `type_modifiers`, `identifier`, `variance_modifier`, …), so
  // this never over-matches a call (`Bar(x)`, already handled by `argRe` above) or a plain `: Bar`. No
  // language or literal node-type name is tested anywhere below — only this structural fingerprint. Every
  // grammar without this shape (all but Kotlin) simply gets an empty set — always defined, never fires.
  b.delegateClauseType = new Set(
    nt
      .filter(n => !(n.fields && Object.keys(n.fields).length))
      .filter(n => {
        const kids = new Set(((n.children && n.children.types) || []).map(t => t.type));
        return kids.size === 2 && kids.has('type') && kids.has('primary_expression');
      })
      .map(n => n.type)
  );
  // the TYPE side's own closure, through the grammar's supertype chain (`type` -> user_type/function_type/…),
  // read with the same `qnExpand` this file already uses to expand a qualified-name field's declared types —
  // whichever of a delegate clause's two children resolves into THIS set is the real heritage half; the other
  // is the delegate expression, excluded below regardless of its own shape (identifier, call, lambda, …).
  b.typeSuperSet = qnExpand('type', new Set());
  // §056 — a DATA-GRAMMAR mapping container, derived from node-types.json alone (never consulted for a code
  // grammar — see the `b.data` guard at its one call site, core.mjs's value-scan walk): CONTAINER_RE below
  // already recognizes JSON's own container node-type NAME ("object"), but YAML's `block_mapping`/`flow_mapping`
  // are named nothing CONTAINER_RE's plain keyword list matches. A node type qualifies here when its OWN
  // declared children admit a `b.keyField` type (above) — JSON's `object` (child `pair`), YAML's
  // `block_mapping`/`flow_mapping` (child `block_mapping_pair`/`flow_pair`) — so every data-grammar mapping
  // whose pairs carry a genuine `key` FIELD is grouped the same way, with no grammar named in the derivation
  // itself. Left unfixed, a mapping's own top-level string/number/boolean children were never grouped as
  // siblings of the container they actually share for YAML specifically, which is what made a service id
  // declared once in one YAML mapping indistinguishable, container-wise, from an unrelated string anywhere else
  // in the same file (§056's own field report). TOML's `pair` carries no `key` FIELD at all (only a
  // `bare_key`/`quoted_key`/`dotted_key` CHILD) and stays exactly as gated before this change — a real,
  // separately pre-existing gap (already measured and flagged as "reported to the orchestrator, out of scope"
  // by container-keypath.test.mjs) that a fieldless-pair heuristic could chase, but only by risking the walk
  // below stopping AT the pair itself instead of the table that actually holds it (TOML's own `table`/
  // `inline_table` nodes structurally admit a bare/dotted/quoted key as a DIRECT child too, for their own
  // header, not just through a nested `pair`) — left for its own dedicated, separately-measured fix instead.
  b.dataContainer = new Set(
    nt.filter(n => ((n.children && n.children.types) || []).some(t => b.keyField.has(t.type))).map(n => n.type)
  );
  // a grammar that declares no name+body scope at all (JSON/YAML/TOML): its files carry no name+body units to
  // mine, only a file-level scope and the raw values it names (§J7.2) — derived, not a name list: 0 for the three
  // data grammars, >=1 for every one of the 19 shipped code grammars
  b.data = b.scope.size === 0;
  b.name = gname;
  bindings[gname] = b;
  return b;
}
const parsers = {};
let _init = false;
async function parserForGrammar(g) {
  if (!_init) {
    await Parser.init();
    _init = true;
  }
  if (!parsers[g]) {
    const lang = await Language.load(join(GRAMMAR_DIR, `tree-sitter-${g}.wasm`));
    const p = new Parser();
    p.setLanguage(lang);
    parsers[g] = p;
    p._g = g;
  }
  return parsers[g];
}
export async function getParser(ext) {
  const g = EXT2GRAMMAR[ext];
  if (!g) throw new Error(`no grammar for extension "${ext}"`);
  return parserForGrammar(g);
}
// §040 — how many places a grammar gave up on: ERROR nodes plus MISSING ones, because a grammar records a failure
// as either (measured: C leaves 4 ERRORs on `class LEVELDB_EXPORT Comparator {`, C++ leaves 0 ERRORs and 1
// MISSING). Descends only into subtrees that carry a failure, so a clean file costs one check at the root.
const parseErrors = tree => {
  let n = 0;
  const st = [tree.rootNode];
  while (st.length) {
    const x = st.pop();
    if (x.isError || x.isMissing) n++;
    if (x.hasError) for (const c of x.children) st.push(c);
  }
  return n;
};
// §040 — parse `src`, choosing between the extension's declared grammar and the second grammar that extension may
// denote (`EXT_ALT`, config.mjs — one entry, `.h`). THE GRAMMAR DECIDES, the same instinct as §018 phase 2: ask
// both and keep the one that actually parsed the bytes, rather than writing down a rule about which projects use
// `.h` for what. Three properties, in order of how load-bearing they are:
//   · the DECLARED mapping wins ties. A genuine C header parses cleanly under both (C++ is very nearly a
//     syntactic superset), so a tie must never migrate a real C project onto C++ node types — every predicate
//     derived from node-types.json would change under it. Measured on redis and curl: 83 and 34 headers tie, and
//     all of them stay C.
//   · no new tuned constant. "Strictly fewer failures" is a comparison between two parses of the same bytes, not
//     a threshold, a ratio or a minimum.
//   · a clean parse under the declared grammar never loads the alternative at all, so the second parse is paid
//     only on files the declared grammar already failed — 9 of leveldb's 56 headers skip it, 208 of redis's 312.
// Everything that parses a file goes through here, HISTORY INCLUDED: a `.h` whose HEAD content reads as C++ must
// read as C++ in its old blobs too, or every scope in it looks newborn at every commit. This does not weaken
// §13.2 (language from the historical PATH, never sniffed from content): the path still decides, and picks the
// same two candidates for every version of the file — only which of the two spelled the bytes is read off them.
export async function parseFile(ext, src) {
  const p = await getParser(ext);
  const tree = p.parse(src);
  const alt = EXT_ALT[ext];
  if (!alt || !tree.rootNode.hasError) return { p, tree };
  const q = await parserForGrammar(alt);
  const t2 = q.parse(src);
  if (parseErrors(t2) < parseErrors(tree)) {
    tree.delete();
    return { p: q, tree: t2 };
  }
  t2.delete();
  return { p, tree };
}
// §018 phase 2: a SECOND parser per grammar, used only to re-parse a macro invocation's token region while the
// file's own tree is still being walked. A dedicated instance, not `parsers[g]`, so that re-entrant parse can
// never interact with the outer walk in any way — one extra object per grammar, created on first macro body seen.
const macroParsers = {};
export function macroParser(b) {
  const p = parsers[b.name];
  if (!p) return null;
  return (macroParsers[b.name] ||= (() => {
    const q = new Parser();
    q.setLanguage(p.language);
    return q;
  })());
}
// no-git fallback walk ONLY — in git mode the universe is the HEAD tree and gitignore already held (see config EXCL note)
export function* walkFiles(dir, root) {
  let es;
  try {
    es = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of es) {
    const full = join(dir, e.name);
    const rel = toPosix(relative(root, full));
    if (EXCL.test(rel + (e.isDirectory() ? '/' : ''))) continue;
    if (e.isDirectory()) yield* walkFiles(full, root);
    else if (CODE_RE.test(e.name) && !MINE_EXCL.test(e.name) && EXT2GRAMMAR[extname(e.name)]) yield rel;
  }
}
export const tokenize = n =>
  (n || '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 1);
// E1 name morphology: identifier → char-class string (`U` upper run, `a` lower/digit run, separators literal, else `?`), runs of one
// char folded, then CASING UNITS folded: `Ua` (PascalCase word), `_a`/`_U` (snake), `-a` (kebab), `.a` (dotted). A single word and
// many words are the SAME style — `Crlf` and `BaseDto` are both `(Ua)+`, `getUser` and `getUserName` both `a(Ua)+` — measured on
// the corpus, a word-count-sensitive shape flagged every one-word class name as a deviation from "names like `BaseDto`".
const SHAPE_UNITS = new Set(['Ua', '_a', '_U', '-a', '-U', '.a', '.U', '$a', '$U']);
export function nameShape(n) {
  if (!n) return '?';
  const r = n
    .replace(/[A-Z]+/g, 'U')
    .replace(/[a-z0-9]+/g, 'a')
    .replace(/[^Ua_\-$.]/g, '?')
    .replace(/(.)\1+/g, '($1)+');
  const toks = r.match(/\([^)]+\)\+|./g) || [];
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const a = toks[i],
      b = toks[i + 1];
    if (a.length === 1 && b && b.length === 1 && SHAPE_UNITS.has(a + b)) {
      const unit = '(' + a + b + ')+';
      out.push(unit);
      i++;
      while (toks[i + 1] === a && toks[i + 2] === b) i += 2;
    } // swallow the run
    else out.push(a);
  }
  return out.join('');
}
export function resolveImport(spec, rel) {
  if (!spec.startsWith('.')) return spec;
  const ps = (dirname(rel) + '/' + spec).split('/');
  const o = [];
  for (const p of ps) {
    if (p === '.' || p === '') continue;
    if (p === '..') o.pop();
    else o.push(p);
  }
  return '~/' + o.join('/').replace(/\.[a-z]+$/, '');
}
export const hashStr = s => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
// word-bounded (never raw-substring) node-TYPE-NAME matchers: a node type's `_`-separated segments must contain the
// whole word, so `struct` matches the segment `struct` in `struct_declaration` but not the letters s-t-r-u-c-t
// buried inside `constructor_declaration` — a raw substring test misclassified every constructor as `typeLike`
export const wordBounded = words => new RegExp('(?:^|_)(?:' + words.join('|') + ')(?:_|$)');
// §bindingFor's sigil-less-decoration derivation (§043): the two halves a decoration's OWN declared children must
// show — something it NAMES, and an application of that name to ARGUMENTS. Same word-bounded node-TYPE-NAME
// technique as the two above; neither is ever matched against a language's own identifiers.
const DECO_NAME_RE = wordBounded(['identifier', 'name']);
const DECO_ARG_RE = wordBounded(['call', 'argument', 'arguments', 'invocation']);
// §bindingFor's `b.qualName` (§062): a "qualified/member name" node type's own leaf constituents — every
// concrete node type this touches, whether a plain identifier or another qualified-name node one level in,
// happens to end in one of these three words across every shipped grammar. Same word-bounded node-TYPE-NAME
// technique as the two above.
const QUAL_NAME_LEAF_RE = wordBounded(['identifier', 'name', 'constant']);
// §bindingFor's `b.retField`: a callable's declared-result field is whichever of its OWN fields admits a child
// node whose type NAMES "type" as a whole word segment (`type`, `_simple_type`, `type_annotation`, `bottom_type`,
// `type_identifier`, …) — matches Go's `result` (declares `_simple_type`), every `return_type` field, Java/Groovy/
// C#'s `type`, and C#'s own `returns` (declares `type`), while correctly rejecting every OTHER leftover field on a
// callable node measured across the shipped grammars (`dimensions`, `operator`, `reference_modifier`,
// `static_modifier`, `interfaces`, `object`, `arguments`, a lone unparenthesized arrow `parameter`) — none of
// those fields' declared child types contain the word "type" (§014/§021 log).
const RESULT_FIELD_RE = wordBounded(['type']);
