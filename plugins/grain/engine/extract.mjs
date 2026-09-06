// grain engine · the node-type predicates and the declaration, member and modifier helpers extraction is built from
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { basename } from 'node:path/posix';
import { tokenize, wordBounded } from './parse.mjs';

// ===== EXTRACTION (binding-driven, language-free) =====
// follow `declarator` fields down to the leaf (C/C++: function_definition → function_declarator → identifier)
export function declaratorChain(n) {
  const out = [];
  let d = n.childForFieldName('declarator');
  let g = 0;
  while (d && g++ < 8) {
    out.push(d);
    d = d.childForFieldName('declarator');
  }
  return out;
}
export const looseBody = n =>
  n.namedChildren.find(c => /body|block/.test(c.type) && !/type|annotation|parameter/.test(c.type)) || null;
export function scopeName(ch) {
  const n = ch.childForFieldName('name');
  if (n) return n.text;
  const chain = declaratorChain(ch);
  const leaf = chain[chain.length - 1];
  if (leaf && /identifier/.test(leaf.type) && !leaf.text.includes('\n')) return leaf.text;
  return '<anon>';
}
// §050 — `object`, not the FULL node-type name `object_declaration` (Kotlin's own name for this construct, the
// PRE-§050 entry here — and exactly the near-miss this bug was: Scala's equivalent construct is named
// `object_definition`, one word off, so a companion object holding only vals — no nested scope for
// `extractScopes`'s `hasChildScope` fallback to catch — was silently invisible as a type). TYPE_LIKE_RE is ONLY
// ever tested against a node type already gated through `isScope` (b.scope — a real name+body/loosebody
// declaration, bindingFor above), so the bare word is safe here in a way it would not be on an unrestricted
// node-type string: a JS/TS object LITERAL (`{a: 1}`, node type `object`) and Java/C#'s
// `object_creation_expression`/`anonymous_object_creation_expression` never reach this regex at all, because
// none of them is a b.scope member (no name+body of their own). Measured against all 23 shipped node-types.json
// (tests/scala-object-type.test.mjs and tests/type-like-coverage.test.mjs): the bare word `object` occurs in
// exactly THREE b.scope node types across every grammar — Kotlin's `object_declaration`, Scala's
// `object_definition`, and Scala's `package_object` — of which the first two actually reach this regex (the
// third, `package_object`, is a location per `isLocationNode`'s own `/package/` match — same rule that already
// walks through a Scala `package` clause — so it never reaches TYPE_LIKE_RE at all; harmless either way, since
// its own vals still surface on the enclosing file scope). Widening `object_declaration` to `object` fixes
// Scala with no new false positive anywhere else. Two other structural derivations were tried and measured to
// NOT generalize: "declares a
// heritage-capable field/child per node-types.json" misses every heritage-less struct/enum/union across
// C/C++/Rust/TS/Solidity — the bulk of TYPE_LIKE_RE's existing entries — and gains only the two Scala node types
// already covered here; "declares no `parameters` field" wrongly promotes Java/Groovy's `record_declaration`,
// which legitimately carries one for its primary constructor.
// §076 — the SAME childless-companion gap §050 fixed for Scala's `object`, now for five more node types that
// §050's own type-like-coverage.test.mjs surfaced: a bodiless/vals-only Java or Groovy `module_declaration`, Ruby
// `module`, TS `internal_module`/`module` (`namespace Foo {}`/`module Foo {}`), and Solidity `library_declaration`
// all fell through to kind `method` for want of a nested child scope, exactly like the pre-fix Scala `object`.
// Fixed the same way: add the bare words `module` and `library` to this list. Verified against all 23 shipped
// node-types.json (tests/type-like-coverage.test.mjs) by the same method as §050 — since TYPE_LIKE_RE only ever
// runs on a node already gated through `isScope` (b.scope), the census that matters is over EACH GRAMMAR'S OWN
// `b.scope` set, not the grammar's raw node-types.json: `module` occurs in exactly seven b.scope node types
// across all 23 grammars — groovy/java `module_declaration`, ruby `module`, tsx/typescript `internal_module` and
// `module` — every one of them genuinely type-like, and no others (C#'s own `module` token and Python's root
// `module` node, and Java/Groovy's unrelated `module_directive`/`module_body`/`requires_module_directive`/etc.,
// are none of them b.scope members, so they never reach this regex at all). `library` occurs in exactly one
// b.scope node type anywhere — Solidity's `library_declaration` — so it carries no collision risk by construction.
// Also removed the pre-existing `singleton` entry: a census of all 23 grammars' b.scope sets found it matches
// exactly ONE node type anywhere — Ruby's `singleton_method` (a `def self.foo` class method) — which is a
// METHOD, not a type, and was a straight false positive (typeLike wins ties in extractScopes below, so this
// singleton_method was misclassified as kind `type` despite FUNC_LIKE_RE also correctly matching it via
// `method`). Ruby's own `singleton_class` (`class << self`) and Scala's `singleton_type` are NOT b.scope members
// (no name+body of their own) and were never reachable through this entry either, so `singleton` had zero
// legitimate match in the entire corpus — removing it fixes the false positive with no loss of coverage anywhere.
export const TYPE_LIKE_RE = wordBounded([
  'class',
  'struct',
  'record',
  'enum',
  'interface',
  'trait',
  'protocol',
  'object',
  'impl_item',
  'type_declaration',
  'companion',
  'module',
  'library',
  'union',
  'contract',
]);
export const FUNC_LIKE_RE = wordBounded([
  'function',
  'method',
  'lambda',
  'closure',
  'arrow',
  'constructor',
  'destructor',
]);
// the identifier node types a declared TYPE reference resolves to, in document order so the OUTER name wins
// (`Stack[T]` -> `Stack`, `Promise<void>` -> `Promise`). Hoisted to module scope: return-type extraction (§021)
// and receiver extraction (§016) must resolve a type reference the same way, or one of them will read a generic
// instantiation where the other reads the type.
export const TYPE_REF_ID_TYPES = [
  'type_identifier',
  'predefined_type',
  'primitive_type',
  'builtin_type',
  'scoped_type_identifier',
  'qualified_type',
  'attribute',
  'dotted_name',
  'scoped_identifier',
  'identifier',
];
// the string-literal node types, shared by the lexical layer's quote-style scan and the value concordance (§J3.1) —
// one list, so "what counts as a string in this repository" cannot drift between the two. `bare_key`/`quoted_key`/
// `dotted_key` are TOML's data-grammar KEY types (JSON/YAML have no key-shaped node of their own — a JSON key IS a
// `string`, a YAML key IS a scalar — so only TOML needs its key types listed here; JSON/YAML keys are told apart
// from values by `isKeyNode` below, via `b.keyField`, not by node type). `key`/`value` are `.properties`' own two
// node types (§006) — unlike JSON/YAML/TOML, tree-sitter-properties declares neither a `key` FIELD on its
// `property` node nor a dedicated `*_key` type name, just a plain child literally typed `key`; without these two
// entries the scan never visits a `.properties` file's scalars at all (`b.data` alone gets you nothing to collect).
export const STR_TYPES = [
  'string',
  'string_literal',
  'interpreted_string_literal',
  'encapsed_string',
  'raw_string',
  'string_scalar',
  'double_quote_scalar',
  'single_quote_scalar',
  'block_scalar',
  'bare_key',
  'quoted_key',
  'dotted_key',
  'key',
  'value',
];
// a node TYPE NAME containing the whole word "key" (TOML's bare_key/quoted_key/dotted_key, `.properties`' own
// `key`) — the type-name half of key detection; the field half (JSON `pair.key`, YAML
// `block_mapping_pair.key`/`flow_pair.key`) is `b.keyField` above. `.properties`' `property` node has NEITHER a
// `key` field nor a `bare_key`-style type name for its key child — it is told apart from its `value` sibling
// purely by KEY_LIKE_RE matching the child's own literal type name "key" (`keyNodeOf`'s namedChildren fallback).
const KEY_LIKE_RE = wordBounded(['key']);
// does node `p` carry an identifiable key CHILD? (JSON/YAML: the `key` field; TOML: a `*_key`-typed child of `pair`)
function keyNodeOf(p, b) {
  if (!p) return null;
  if (b.keyField.has(p.type)) return p.childForFieldName('key');
  return (p.namedChildren || []).find(c => KEY_LIKE_RE.test(c.type)) || null;
}
// is node `n` ITSELF the key (not the value) of some ancestor pair? Climbs through "transparent" single-named-child
// wrapper nodes — needed for YAML's real parse chain, e.g. `string_scalar -> plain_scalar -> flow_node<key> ->
// block_mapping_pair` — a plain single-parent check misclassifies every YAML key. Depth cap 4 and the
// namedChildCount!==1 guard are both load-bearing, verified against real parses of all three grammars.
export function isKeyNode(n, b) {
  let cur = n;
  for (let d = 0; d < 4 && cur.parent; d++) {
    const p = cur.parent;
    const kn = keyNodeOf(p, b);
    // `.id`, not `===`: web-tree-sitter hands back a FRESH JS wrapper object from every accessor call, even for the
    // same underlying node — two references to the identical node fail a `===` check (confirmed empirically: this
    // codebase's own node-identity comparisons elsewhere, e.g. `c2.id === bodyN.id` above, already work around it)
    if (kn) return kn.id === cur.id;
    if ((p.namedChildCount || 0) !== 1) return false; // p is not a transparent single-child wrapper — stop
    cur = p;
  }
  return false;
}
// a key node's own text, quotes stripped the same way a data-grammar value's text is (§J7.2, core.mjs ~428) —
// one stripping rule for both halves of a pair, so a key and a value never disagree on what "the text" means.
const keyText = n => n.text.replace(/^["'`]|["'`]$/g, '');
// §J7.3: the key-path identity of a DATA container (`b.data` only) — `$.a.b` built by climbing from `node` through
// its ancestors, collecting the key text of every pair `node` (or an intermediate ancestor on the way up) sits on
// the VALUE side of. An array contributes no segment of its own: its elements share the array's own path, which is
// exactly what lets `steps: [...]`'s N object elements collapse into ONE container across files.
export function keyPathOf(node, b) {
  const segs = [];
  let cur = node;
  while (cur.parent && segs.length < 8) {
    const p = cur.parent;
    const kn = keyNodeOf(p, b);
    if (kn && kn.id !== cur.id) segs.push(keyText(kn)); // kn.id !== cur.id: don't re-add the key as its own path segment
    cur = p;
  }
  return (
    '$' +
    segs
      .reverse()
      .map(s => '.' + s)
      .join('')
  );
}
// value concordance (§J3.1). ENUM_LIKE_RE is narrower than TYPE_LIKE_RE on purpose: only an enum DECLARATION
// (which additionally must have a body) enumerates values; `enum_body`/`enum_assignment` match the word too and are
// excluded by the body requirement alone. ENUM_MEMBER_RE catches the member shapes that carry no `name` field of
// their own — TypeScript's bare `property_identifier` leaves under `enum_body` are the load-bearing case, and the
// name-field rule never sees them. CONTAINER_RE names the syntactic groupings whose members are siblings.
export const ENUM_LIKE_RE = wordBounded(['enum']);
export const ENUM_MEMBER_RE = wordBounded(['identifier', 'enumerator', 'enum_entry']);
export const CONTAINER_RE = wordBounded(['switch', 'object', 'dictionary', 'array', 'enum', 'case', 'match']);
export const VAL_CAP = 200; // values kept per file (enum members first, then string literals)
export const VAL_SCAN_CAP = 2000; // nodes examined per scan pass, as lexicalPreds caps its own string scan
export const VALUE_INDEX_CAP = 20000; // repo-wide value index entries retained; the least-frequent go first
export const VALUE_NORM_PLACES = 12; // places listed on one `kin:` value line, the same display cap the render lists carry
// a path's name before its first dot (`dispute.handler.ts` -> `dispute`), the pairing key for every same-stem
// companion rule in the engine: impliedOf's companion/groupKin evidence and missingLines' recipe/kin renders
export const stem0 = rel => basename(rel).split('.')[0];
// a namespace/package/module STATEMENT names a location, not a unit of code (walked through, never itself a
// scope, and never counted as a "real" nested scope for its parent's type/method classification) — 'mod' is
// word-bounded via the shared wordBounded() helper, never a plain substring, so Ruby's real type-like `module`
// declaration is untouched (§G15b)
const MOD_LOCATION_RE = wordBounded(['mod']);
export const isLocationNode = t => /namespace|package/.test(t) || MOD_LOCATION_RE.test(t);
// a function/arrow/lambda-shaped VALUE, for the assignment-side anonymous-function detector below — word-bounded
// alone is not sufficient (PHP's plain call node `function_call_expression` still matches the segment `function`);
// the detector additionally requires the value to have a real BODY, which a call node never does (§G16)
export const FUNC_VALUE_RE = wordBounded(['function', 'arrow', 'lambda', 'func_literal', 'closure']);
// primary-constructor detection (a type's OWN header carries its constructor's parameters, C# 12 `class Foo(IBar bar)`
// / Kotlin `class Foo(val bar: Bar)` style): confirmed by scanning every shipped grammar's node-types.json for any
// TYPE_LIKE_RE node exposing one of these, not guessed —
//  · C# class_declaration/struct_declaration/record_declaration: the ONLY type-like nodes, in any shipped grammar,
//    that admit a bare positional `parameter_list` child (neither declares a `parameters` field — only `body`/`name`
//    are fields) sitting beside `base_list`/`declaration_list`. Distinct from `type_parameter_list` (C# generics
//    `<T>`) — a wholly different node-type string; the scan found no other type-like node anywhere exposing
//    `parameter_list` as a child or field.
//  · Kotlin: `primary_constructor`, an explicit dedicated node type, a direct child of `class_declaration`, distinct
//    from Kotlin's own `type_parameters` node for `<T>`.
//  · Scala: `class_parameters`, an actual NAMED FIELD of `class_definition`/`trait_definition`/`enum_definition`/
//    `full_enum_case` (fires identically for `case class Foo(x: Int)` and plain `class Foo(x: Int)` — `case` is a
//    modifier, not a different node type), distinct from Scala's own `type_parameters` field for `[T]`.
//  · Java and Groovy `record_declaration` alone (never plain `class_declaration`/`interface_declaration`, which
//    declare no such field): a `parameters` field mapping to `formal_parameters` — `record Foo(int x) {}`'s header.
// No other shipped grammar/node type has any of these — confirmed by scanning every grammar's node-types.json for a
// type-like node exposing `parameter_list`/`class_parameters`/a `parameters` field, not assumed. (One unrelated
// pre-existing false-positive risk was checked and is clear: Ruby's `singleton_method` also has a `parameters` field,
// but its node type is `singleton_method`, never `record_declaration`, so the Java/Groovy check below can't fire on it.)
const PRIMARY_CTOR_CHILD_TYPES = new Set(['parameter_list', 'primary_constructor']);
export const hasPrimaryCtor = ch =>
  ch.namedChildren.some(c => PRIMARY_CTOR_CHILD_TYPES.has(c.type)) ||
  !!ch.childForFieldName('class_parameters') ||
  (ch.type === 'record_declaration' && !!ch.childForFieldName('parameters'));
// classic (body) constructor: an existing member whose node type contains the WORD `constructor` (same word-boundary
// technique as FUNC_LIKE_RE, narrowed to just this word) — a destructor-only type has no classic constructor either
export const CTOR_LIKE_RE = wordBounded(['constructor']);
// field-like MEMBER declarations, the one classification `auto.memberorder` needs that no existing regex covers
// (`ctor` is CTOR_LIKE_RE, `method` is FUNC_LIKE_RE). Verified against the shipped node-types.json of java
// (field_declaration), c_sharp (field_declaration/property_declaration/event_field_declaration), typescript
// (public_field_definition), kotlin (property_declaration), php (property_declaration/const_declaration) and go
// (field_declaration/const_declaration) — the same word-boundary technique, over NODE-TYPE names only.
const FIELD_LIKE_RE = wordBounded(['field', 'property', 'variable_declarator', 'const_declaration']);
// ===== DECLARATION MODIFIERS (§auto.mods) =====
// An honest description of what this is: a FIXED vocabulary of nine English words — the same category of list as
// TYPE_LIKE_RE/FUNC_LIKE_RE/CTOR_LIKE_RE, i.e. one written over node-type names, never over language or framework
// names — FILTERED by what each grammar actually declares as an anonymous token (`b.anonTypes`). It is NOT derived
// from the grammar in any stronger sense: a `modifiers` node's `children.types` in node-types.json enumerates only
// its NAMED children and never the anonymous keywords, so the grammar can subtract from this list but not supply it.
// Measured coverage of the nine: java 6, c_sharp 7, typescript 8, kotlin 6, scala 6, php 6, cpp 6, rust 2, python 1, go 0.
const MODIFIER_KEYWORD_RE = wordBounded([
  'public',
  'private',
  'protected',
  'static',
  'async',
  'export',
  'abstract',
  'final',
  'override',
]);
// where the keyword actually SITS differs per grammar and is never uniform: python/typescript hang `async`/`static`
// straight off the declaration, java wraps them in one `modifiers` node, c_sharp repeats a `modifier` node per word,
// php uses `visibility_modifier`/`static_modifier`, and kotlin nests `modifiers > visibility_modifier > private` —
// three levels down. So the scan descends through modifier HOLDER nodes (and nothing else, which is what keeps it
// out of the body) rather than reading one fixed depth.
const MODIFIER_HOLDER_RE = wordBounded(['modifier', 'modifiers']);
export function modifiersOf(node, b) {
  const found = new Set();
  const scan = (n, depth) => {
    if (depth > 3) return;
    for (const c of n.children) {
      if (b.anonTypes.has(c.type)) {
        if (MODIFIER_KEYWORD_RE.test(c.type)) found.add(c.type);
      } else if (MODIFIER_HOLDER_RE.test(c.type)) scan(c, depth + 1);
    }
  };
  scan(node, 0);
  // ONE categorical string, never an array — mine() needs a single comparable value per pid. The empty case is the
  // literal 'none': mine()'s vacuity gate rejects ['other','none','mixed','?'] by name and would let a bare '' through,
  // making a ubiquitous vacuous fact on every grammar where this feature never fires (go matches none of the nine).
  return found.size ? [...found].sort().join(',') : 'none';
}
// ===== MEMBER LAYOUT (§auto.memberorder) =====
// COMPRESSION GRAMMAR (exact — the ticket's own `f+c m+` sketch left the separator convention open):
//   letter   := 'f' (FIELD_LIKE_RE) | 'c' (CTOR_LIKE_RE) | 'm' (FUNC_LIKE_RE), tested in THAT order because the
//               three are loosely worded enough to overlap and `field` is the most specific of them
//   sequence := the classified DIRECT named children of the type body, in source order; a child matching none of
//               the three is skipped entirely and leaves no trace
//   run      := a maximal sub-sequence of identical letters
//   token    := <letter> for a run of exactly 1 | <letter>'+' for a run of 2 or more ('+' is "two or more", NEVER a count)
//   pattern  := tokens joined by exactly ONE space          e.g.  f f c m m  ->  'f+ c m+'
//   fewer than two runs -> 'none'; more than MEMBERORDER_RUNS runs -> the first MEMBERORDER_RUNS tokens plus '…'
// A body holding only ONE category has no member ORDER to speak of — 'm+' would read as "types here order their
// members m+" while claiming nothing but "these types hold only methods", the same composition-not-choice vacuity
// STRUCT_PID exists to suppress. It collapses to 'none' and is dropped by mine()'s vacuity gate.
// The string parses back to its run structure uniquely (split on ' '; a trailing '+' means "run >= 2"). Exact run
// LENGTHS are discarded on purpose: they are what would blow the alphabet up, and mine()'s λ bound carries K = |V|+1
// directly in its denominator, so a large alphabet silences the fact outright.
const MEMBERORDER_RUNS = 6;
export function memberOrder(bodyN) {
  const seq = [];
  for (const c of bodyN.namedChildren) {
    const l = FIELD_LIKE_RE.test(c.type)
      ? 'f'
      : CTOR_LIKE_RE.test(c.type)
        ? 'c'
        : FUNC_LIKE_RE.test(c.type)
          ? 'm'
          : null;
    if (l) seq.push(l);
  }
  const toks = [];
  for (let i = 0; i < seq.length; ) {
    let j = i;
    while (j < seq.length && seq[j] === seq[i]) j++;
    toks.push(seq[i] + (j - i >= 2 ? '+' : ''));
    i = j;
  }
  if (toks.length < 2) return 'none';
  return toks.length > MEMBERORDER_RUNS ? toks.slice(0, MEMBERORDER_RUNS).join(' ') + ' …' : toks.join(' ');
}
// the last token of a name, as a convention in its own right (`*Handler`, `*Service`, `*Repository`). Plain
// `tokenize`, NEVER `nameTokens`: nameTokens filters through PL_STOP, which holds exactly the suffix vocabulary this
// predicate is made of (model/service/controller/component/view/type/module/config) and would return the word BEFORE
// the suffix — the identical artefact J3.4 already found and fixed once in its own name comparison.
export const nameSuffix = name => {
  const t = tokenize(name);
  return t.length >= 2 ? t[t.length - 1] : 'none';
};
// §082: resolve a heritage-shaped clause node (`c2` below — an extends/implements/base clause, or Python's bare
// `superclasses` argument_list) to its real base-name candidates, applying the §049 call-argument exclusion and
// the §062 qualified/member-chain leaf resolution. Shared by the generic per-clause walk AND Python's dedicated
// `superclasses` field, which used to bypass both fixes entirely: it read `sc.descendantsOfType('identifier')`
// PLUS `sc.descendantsOfType('attribute')`, collecting every nesting level of a dotted base as its own candidate
// (`class Foo(pkg.sub.Type)` recorded `pkg`, `pkg.sub`, AND `pkg.sub.Type`) instead of routing through the same
// leaf-only resolution already correct for every other grammar's qualified heritage names since §062. Fixed by
// deleting that duplicate, narrower walk and calling this shared one instead — no `lang === 'python'` check;
// `sc` is simply passed in as another `c2`-shaped root, and `b.qualName` (already populated for Python's
// `attribute` node type by §062's own structural derivation, verified in bindingFor) does the rest.
export function heritageNamesOf(c2, b, heritageIdTypes, heritageIdTypeSet) {
  const out = [];
  for (const id of c2.descendantsOfType(heritageIdTypes)) {
    let anc = id.parent,
      prevChild = id,
      inArg = false,
      inPrefix = false,
      inDelegate = false,
      inLifetime = false,
      hKind = null;
    while (anc && anc.id !== c2.id) {
      if (b.genArgRe.test(anc.type) || b.argRe.test(anc.type)) {
        inArg = true;
        break;
      } // `AbstractValidator<TQuery>`: TQuery sits under a type_argument_list — a slot, not a base type. `AbstractController(cc)`: cc sits under an argument list — a call operand, not a base type
      // §084: `anc` is a LIFETIME node (Rust's `'static`, `'a`, `'de`) — a lifetime annotation, never a
      // trait or type, however deep the walk needs to climb to find it (a generic bound's own
      // `lifetime_parameter`, `for_lifetimes`'s children). `Sync + Send + 'static`: `static` sits under a
      // `lifetime` node — a lifetime bound, not a base type.
      if (b.lifetimeRe.test(anc.type)) {
        inLifetime = true;
        break;
      }
      // §083: `anc` is a TYPE-vs-EXPRESSION duality clause (Kotlin's `explicit_delegation` — `Bar by
      // expr`) and `prevChild` is whichever of its two children `id` descends through. Only the child
      // that resolves into the TYPE side's own supertype closure (`b.typeSuperSet`) is real heritage;
      // the delegate expression — a bare identifier, a function call, anything — is excluded here,
      // however it is shaped, without assuming a field name or a fixed grammar position.
      if (b.delegateClauseType.has(anc.type) && !b.typeSuperSet.has(prevChild.type)) {
        inDelegate = true;
        break;
      }
      if (b.qualName.has(anc.type)) {
        let slot = prevChild;
        while (slot.parent && slot.parent.id !== anc.id) slot = slot.parent;
        for (const sib of anc.namedChildren)
          if (
            sib.id !== slot.id &&
            sib.startIndex > slot.startIndex &&
            (heritageIdTypeSet.has(sib.type) || b.qualName.has(sib.type))
          ) {
            inPrefix = true;
            break;
          }
        if (inPrefix) break;
      }
      if (!hKind) {
        if (b.implementsClauseRe.test(anc.type)) hKind = 'impl';
        else if (b.extendsClauseRe.test(anc.type)) hKind = 'ext';
      }
      prevChild = anc;
      anc = anc.parent;
    }
    if (!inArg && !inPrefix && !inDelegate && !inLifetime) {
      if (!hKind)
        hKind = b.implementsClauseRe.test(c2.type)
          ? 'impl'
          : b.extendsClauseRe.test(c2.type)
            ? 'ext'
            : null; // c2 itself IS the specific clause where there is no wrapper (PHP/Java/Groovy)
      const nm =
        id.type === 'qualified_name' || id.type === 'relative_name'
          ? id.text.split('\\').pop()
          : id.text; // PHP names its identifiers `name`/`qualified_name`; the FQCN's tail is the vocabulary an agent uses
      out.push({ nm, hKind });
    }
  }
  return out;
}
