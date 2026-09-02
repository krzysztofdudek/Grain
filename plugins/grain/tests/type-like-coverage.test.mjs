// §050 — the regression net for "the class of bug", not just the one Scala instance: `TYPE_LIKE_RE`/`FUNC_LIKE_RE`
// (core.mjs) are a FIXED vocabulary of English words matched word-bounded over node-TYPE names (same category of
// thing as `MODIFIER_KEYWORD_RE`, `tests/new-predicates.test.mjs`'s honest framing) — not derived from
// node-types.json in any stronger sense, so a grammar whose declaration node happens to spell a concept with a
// DIFFERENT word (Kotlin `object_declaration` vs Scala `object_definition`) is invisible to it until someone
// notices. This test enumerates EVERY node type in `bindingFor(g).scope` — the actual set `isScope` gates
// classification on — for all 23 shipped grammars, cross-referenced against each one's own node-types.json (the
// dump this table is built from), and pins what TYPE_LIKE_RE/FUNC_LIKE_RE currently say about each. A future
// grammar update, or a new grammar, that adds a genuinely type-like or method-like scope node neither regex
// catches will show up here as a node type with NO entry in this table — caught by the "every grammar's scope
// set is fully accounted for" test below — rather than discovered by a field report.
//
// Four buckets, one per scope node type:
//   TYPE   — an unambiguous named-type declaration (class/struct/interface/enum/trait/object/record/union/…):
//            TYPE_LIKE_RE must match, FUNC_LIKE_RE must not.
//   METHOD — an unambiguous callable (function/method/constructor/destructor/lambda/…):
//            FUNC_LIKE_RE must match, TYPE_LIKE_RE must not.
//   LOCATION_OR_ACCESSOR — intercepted by `extractScopes` BEFORE either regex ever runs (`isLocationNode` for a
//            namespace/package/mod statement, `/accessor/` for a C# property get/set/init) — never itself
//            classified, so neither regex's verdict matters; asserted here structurally (the interception
//            predicate itself), not through a parsed fixture.
//   QUIRK  — a scope node that is NOT a plain declaration or callable (an enum member/constant/variant, a
//            control-flow node that happens to be body-shaped, a DSL-style call, a construct neither regex
//            names and whose real kind comes only from `extractScopes`'s per-instance `hasChildScope` fallback).
//            Each QUIRK entry pins the CURRENT TYPE_LIKE_RE/FUNC_LIKE_RE verdict as a known, deliberate
//            characterization — some are harmless (an enum constant reads as "type", which is defensible), one
//            is a genuine pre-existing false positive (Ruby's `singleton_method`, a plain instance method,
//            matches the word `singleton`), and several are the SAME bug class as §050 in a different grammar
//            (a childless Java/Groovy `module_declaration`, TS `internal_module`/`module`, Ruby `module`, or a
//            Solidity `library_declaration` holding only constants would default to kind `method` via the
//            hasChildScope fallback, exactly like the pre-fix Scala `object_definition`) — flagged individually
//            below and left for their own ticket rather than folded into this one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindingFor, TYPE_LIKE_RE, FUNC_LIKE_RE, isLocationNode } from '../engine/core.mjs';
import { GRAMMARS } from '../engine/config.mjs';

const ACCESSOR_RE = /accessor/; // the exact predicate `extractScopes` uses (core.mjs) before either regex runs

// [grammar, nodeType, bucket, note] — note is required on LOCATION_OR_ACCESSOR/QUIRK, optional elsewhere
const T = 'TYPE', M = 'METHOD', L = 'LOCATION_OR_ACCESSOR', Q = 'QUIRK';
const TABLE = [
  // ---- bash ----
  ['bash', 'function_definition', M],
  // ---- c ----
  ['c', 'enum_specifier', T],
  ['c', 'function_definition', M],
  ['c', 'struct_specifier', T],
  ['c', 'union_specifier', T],
  // ---- c_sharp ----
  ['c_sharp', 'accessor_declaration', L, 'a property get/set/init accessor — intercepted by /accessor/'],
  ['c_sharp', 'class_declaration', T],
  ['c_sharp', 'constructor_declaration', M],
  ['c_sharp', 'destructor_declaration', M],
  ['c_sharp', 'enum_declaration', T],
  ['c_sharp', 'enum_member_declaration', Q, 'a single enum member (e.g. `Red = 1`) — matches TYPE_LIKE_RE via its `enum_` prefix; pre-existing, harmless'],
  ['c_sharp', 'interface_declaration', T],
  ['c_sharp', 'local_function_statement', M],
  ['c_sharp', 'method_declaration', M],
  ['c_sharp', 'namespace_declaration', L, 'a namespace statement — intercepted by isLocationNode'],
  ['c_sharp', 'record_declaration', T],
  ['c_sharp', 'struct_declaration', T],
  // ---- cpp ----
  ['cpp', 'class_specifier', T],
  ['cpp', 'enum_specifier', T],
  ['cpp', 'for_range_loop', Q, 'a range-for loop happens to be body+declarator-shaped — neither regex matches; real kind comes from the instance-dependent hasChildScope fallback, not from either word list'],
  ['cpp', 'function_definition', M],
  ['cpp', 'lambda_expression', M],
  ['cpp', 'namespace_alias_definition', L, 'a namespace alias — intercepted by isLocationNode'],
  ['cpp', 'namespace_definition', L, 'a namespace statement — intercepted by isLocationNode'],
  ['cpp', 'struct_specifier', T],
  ['cpp', 'union_specifier', T],
  // ---- go ----
  ['go', 'function_declaration', M],
  ['go', 'method_declaration', M],
  // ---- groovy ----
  ['groovy', 'annotation_type_declaration', T],
  ['groovy', 'class_declaration', T],
  ['groovy', 'compact_constructor_declaration', M],
  ['groovy', 'constructor_declaration', M],
  ['groovy', 'enhanced_for_statement', Q, 'a for-each loop happens to be body-shaped — neither regex matches, same as cpp for_range_loop'],
  ['groovy', 'enum_constant', Q, 'a single enum constant (can carry an anonymous class body) — matches TYPE_LIKE_RE via its `enum_`-adjacent word; pre-existing, defensible'],
  ['groovy', 'enum_declaration', T],
  ['groovy', 'function_definition', M],
  ['groovy', 'interface_declaration', T],
  ['groovy', 'method_declaration', M],
  ['groovy', 'method_invocation', Q, 'a builder-style call with a trailing closure (`task { ... }`) — matches FUNC_LIKE_RE via `method`; pre-existing, harmless (a DSL call classified as kind "method" is reasonable)'],
  ['groovy', 'module_declaration', Q, 'RELATED GAP, out of scope for §050: a Java/Groovy module-info declaration matches neither regex, so a module with no nested class/method defaults to kind "method" via hasChildScope — the same bug class as the Scala object bug, flagged for its own ticket'],
  ['groovy', 'record_declaration', T],
  // ---- java ----
  ['java', 'annotation_type_declaration', T],
  ['java', 'class_declaration', T],
  ['java', 'compact_constructor_declaration', M],
  ['java', 'constructor_declaration', M],
  ['java', 'enhanced_for_statement', Q, 'a for-each loop happens to be body-shaped — neither regex matches'],
  ['java', 'enum_constant', Q, 'a single enum constant — matches TYPE_LIKE_RE via its `enum_`-adjacent word; pre-existing, defensible'],
  ['java', 'enum_declaration', T],
  ['java', 'interface_declaration', T],
  ['java', 'method_declaration', M],
  ['java', 'module_declaration', Q, 'RELATED GAP, out of scope for §050 — see groovy/module_declaration above, same construct'],
  ['java', 'record_declaration', T],
  // ---- javascript ----
  ['javascript', 'class', T],
  ['javascript', 'class_declaration', T],
  ['javascript', 'function_declaration', M],
  ['javascript', 'function_expression', M],
  ['javascript', 'generator_function', M],
  ['javascript', 'generator_function_declaration', M],
  ['javascript', 'method_definition', M],
  // ---- kotlin ---- (object_declaration is the ORIGINAL correct case §050 must not regress)
  ['kotlin', 'class_declaration', T],
  ['kotlin', 'function_declaration', M],
  ['kotlin', 'object_declaration', T],
  // ---- lua ----
  ['lua', 'function_declaration', M],
  // ---- php ----
  ['php', 'catch_clause', Q, 'an exception catch block happens to be body-shaped — neither regex matches'],
  ['php', 'class_declaration', T],
  ['php', 'enum_declaration', T],
  ['php', 'function_definition', M],
  ['php', 'interface_declaration', T],
  ['php', 'method_declaration', M],
  ['php', 'namespace_definition', L, 'a namespace statement — intercepted by isLocationNode'],
  ['php', 'trait_declaration', T],
  // ---- python ----
  ['python', 'class_definition', T],
  ['python', 'function_definition', M],
  // ---- ruby ----
  ['ruby', 'class', T],
  ['ruby', 'method', M],
  ['ruby', 'module', Q, 'RELATED GAP, out of scope for §050: Ruby\'s `module` (§G15b: deliberately NOT caught by MOD_LOCATION_RE, since "mod" != "module" word-bounded) matches neither regex, so a vals-only module defaults to kind "method" via hasChildScope — same bug class, flagged for its own ticket'],
  ['ruby', 'singleton_method', Q, 'KNOWN PRE-EXISTING FALSE POSITIVE, out of scope for §050: a class method (`def self.foo; end`) matches BOTH regexes — FUNC_LIKE_RE correctly via "method", but TYPE_LIKE_RE also wrongly via "singleton" (a word meant for Kotlin/Scala/C++ singleton-shaped TYPES, colliding here with Ruby\'s unrelated "singleton method" terminology) — and typeLike wins ties in extractScopes, so this classifies as kind "type". Flagged for its own ticket, not fixed here.'],
  // ---- rust ----
  ['rust', 'enum_item', T],
  ['rust', 'enum_variant', Q, 'a single enum variant — matches TYPE_LIKE_RE via its `enum_`-adjacent word; pre-existing, defensible'],
  ['rust', 'function_item', M],
  ['rust', 'mod_item', L, 'a `mod { ... }` block — intercepted by isLocationNode via MOD_LOCATION_RE'],
  ['rust', 'struct_expression', Q, 'a struct LITERAL (`Foo { x: 1 }`), not a declaration — TYPE_LIKE_RE matches the bare word "struct", but extractScopes\' own `!expression`-suffix guard excludes it from typeLike at the call site (see tests/rust-struct-expression-mod-not-type.test.mjs for the full-pipeline assertion)'],
  ['rust', 'struct_item', T],
  ['rust', 'trait_item', T],
  ['rust', 'union_item', T],
  // ---- scala ---- (object_definition is THE §050 FIX)
  ['scala', 'class_definition', T],
  ['scala', 'enum_definition', T],
  ['scala', 'function_declaration', M],
  ['scala', 'function_definition', M],
  ['scala', 'given_definition', Q, 'a Scala 3 `given` instance — matches neither regex; real kind is instance-dependent (hasChildScope), not part of §050'],
  ['scala', 'object_definition', T, '§050 — THE FIX: was invisible as a type before this ticket (matched neither regex)'],
  ['scala', 'package_clause', L, 'a `package foo.bar` statement — intercepted by isLocationNode via its `package` substring'],
  ['scala', 'package_object', L, 'a `package object foo { ... }` — also intercepted by isLocationNode (same `package` substring match as package_clause), so §050\'s TYPE_LIKE_RE widening never actually reaches it; its own vals still surface on the enclosing file scope'],
  ['scala', 'trait_definition', T],
  // ---- solidity ----
  ['solidity', 'contract_declaration', T],
  ['solidity', 'enum_declaration', T],
  ['solidity', 'function_definition', M],
  ['solidity', 'interface_declaration', T],
  ['solidity', 'library_declaration', Q, 'RELATED GAP, out of scope for §050: a Solidity `library` matches neither regex, so a library holding only constants defaults to kind "method" via hasChildScope — same bug class, flagged for its own ticket'],
  ['solidity', 'modifier_definition', Q, 'a function modifier (`modifier onlyOwner() { ... }`) matches neither regex; real kind is instance-dependent (hasChildScope), typically resolving to "method" in practice since a modifier is callable-shaped — not part of §050'],
  ['solidity', 'struct_declaration', T],
  // ---- tsx / typescript (identical scope sets) ----
  ...['tsx', 'typescript'].flatMap(g => [
    [g, 'abstract_class_declaration', T],
    [g, 'class', T],
    [g, 'class_declaration', T],
    [g, 'enum_declaration', T],
    [g, 'function_declaration', M],
    [g, 'function_expression', M],
    [g, 'generator_function', M],
    [g, 'generator_function_declaration', M],
    [g, 'interface_declaration', T],
    [g, 'internal_module', Q, 'RELATED GAP, out of scope for §050: a TS namespace-style `module Foo { ... }` matches neither regex, so a vals-only one defaults to kind "method" via hasChildScope — same bug class, flagged for its own ticket'],
    [g, 'method_definition', M],
    [g, 'module', Q, 'RELATED GAP, out of scope for §050: an ambient `declare module "foo" { ... }` — same reasoning as internal_module above'],
  ]),
  // ---- zig ----
  ['zig', 'function_declaration', M],
];

test('every TYPE-bucket entry matches TYPE_LIKE_RE and not FUNC_LIKE_RE', () => {
  for (const [g, t, bucket] of TABLE) if (bucket === T) {
    assert.ok(TYPE_LIKE_RE.test(t), `${g}/${t}: expected TYPE_LIKE_RE to match`);
    assert.ok(!FUNC_LIKE_RE.test(t), `${g}/${t}: expected FUNC_LIKE_RE to NOT match`);
  }
});

test('every METHOD-bucket entry matches FUNC_LIKE_RE and not TYPE_LIKE_RE', () => {
  for (const [g, t, bucket] of TABLE) if (bucket === M) {
    assert.ok(FUNC_LIKE_RE.test(t), `${g}/${t}: expected FUNC_LIKE_RE to match`);
    assert.ok(!TYPE_LIKE_RE.test(t), `${g}/${t}: expected TYPE_LIKE_RE to NOT match`);
  }
});

test('every LOCATION_OR_ACCESSOR-bucket entry is genuinely intercepted before either regex runs', () => {
  for (const [g, t, bucket] of TABLE) if (bucket === L) {
    assert.ok(isLocationNode(t) || ACCESSOR_RE.test(t), `${g}/${t}: expected isLocationNode or /accessor/ to intercept this node type`);
  }
});

// QUIRK entries pin the CURRENT characterization exactly, per its own note above — this is the bucket most
// likely to catch a REGRESSION (a word-list edit that accidentally changes one of these known quirks) as well
// as a genuinely new gap (a future entry someone adds here without checking what it currently does).
const QUIRK_EXPECT = {
  'c_sharp/enum_member_declaration': { type: true, func: false },
  'cpp/for_range_loop': { type: false, func: false },
  'groovy/enhanced_for_statement': { type: false, func: false },
  'groovy/enum_constant': { type: true, func: false },
  'groovy/method_invocation': { type: false, func: true },
  'groovy/module_declaration': { type: false, func: false },
  'java/enhanced_for_statement': { type: false, func: false },
  'java/enum_constant': { type: true, func: false },
  'java/module_declaration': { type: false, func: false },
  'php/catch_clause': { type: false, func: false },
  'ruby/module': { type: false, func: false },
  'ruby/singleton_method': { type: true, func: true }, // the known false positive — TYPE_LIKE_RE wrongly ALSO matches (func:true is correct on its own; typeLike wins ties in extractScopes)
  'rust/enum_variant': { type: true, func: false },
  'rust/struct_expression': { type: true, func: false }, // matches at the regex level; excluded downstream by the `!expression` guard (see rust-struct-expression-mod-not-type.test.mjs)
  'scala/given_definition': { type: false, func: false },
  'solidity/library_declaration': { type: false, func: false },
  'solidity/modifier_definition': { type: false, func: false },
  'tsx/internal_module': { type: false, func: false },
  'tsx/module': { type: false, func: false },
  'typescript/internal_module': { type: false, func: false },
  'typescript/module': { type: false, func: false },
};
test('every QUIRK-bucket entry matches its pinned, documented characterization exactly', () => {
  for (const [g, t, bucket] of TABLE) if (bucket === Q) {
    const key = `${g}/${t}`;
    const exp = QUIRK_EXPECT[key];
    assert.ok(exp, `${key}: missing a pinned QUIRK_EXPECT entry — every QUIRK row must be characterized`);
    assert.equal(TYPE_LIKE_RE.test(t), exp.type, `${key}: TYPE_LIKE_RE characterization drifted`);
    assert.equal(FUNC_LIKE_RE.test(t), exp.func, `${key}: FUNC_LIKE_RE characterization drifted`);
  }
});

test('every entry names a real node type in that grammar\'s own bindingFor().scope (no stale/typo\'d rows)', () => {
  for (const [g, t] of TABLE) assert.ok(bindingFor(g).scope.has(t), `${g}/${t}: not present in bindingFor(${g}).scope — table entry is stale or the grammar changed`);
});

test('every scope node type, in all 23 shipped grammars, is accounted for by exactly one TABLE row (the actual "next gap in ANY grammar" net)', () => {
  const covered = new Set(TABLE.map(([g, t]) => `${g}/${t}`));
  const missing = [];
  for (const g of GRAMMARS) for (const t of bindingFor(g).scope) if (!covered.has(`${g}/${t}`)) missing.push(`${g}/${t}`);
  assert.deepEqual(missing, [], `new/uncovered scope node type(s) found — classify each into TYPE/METHOD/LOCATION_OR_ACCESSOR/QUIRK above:\n${missing.join('\n')}`);
});

test('sanity: TABLE actually spans all 23 shipped grammars', () => {
  const seen = new Set(TABLE.map(([g]) => g));
  for (const g of GRAMMARS) assert.ok(seen.has(g) || bindingFor(g).scope.size === 0, `${g}: has scope node types but no TABLE row at all`);
  assert.equal(GRAMMARS.length, 23, 'sanity: this ticket assumed 23 shipped grammars — update the table above if that changed');
});
