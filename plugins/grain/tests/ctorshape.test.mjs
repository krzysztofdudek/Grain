// New fact family: `auto.ctorshape` (type-kind scopes only) — does a type declare its constructor's parameters in
// its OWN header (a "primary constructor": C# 12 `class Foo(IBar bar)`, Kotlin `class Foo(val bar: Bar)`, Scala
// `case class Foo(x: Int)`, Java/Groovy `record Foo(int x) {}`) or as a nested classic member (`constructor_declaration`
// et al.), both, or neither.
//
// Motivation (a real, live migration pattern, confirmed by a field report): one production C# codebase had 50
// classes on the new primary-constructor style and 434 still on the classic style — a split grain's engine could
// not see at all, because a primary constructor's parameter list is invisible to the field-based extraction that
// already looks for `ch.childForFieldName('parameters')`: C#'s class_declaration/struct_declaration/record_declaration
// never declare a `parameters` field (only `body`/`name`) — a primary constructor's parameter list is a bare,
// UNNAMED positional child of type `parameter_list`, confirmed by direct parsing/dumping (see core.mjs's doc comment
// above `hasPrimaryCtor`/`PRIMARY_CTOR_CHILD_TYPES`/`CTOR_LIKE_RE` for the full per-grammar evidence).
//
// The critical trap this must avoid (the same shape of bug A2 fixed for `struct`/`constructor`): C#'s generic type
// parameters (`class Foo<T>`) sit in a DIFFERENT node-type string, `type_parameter_list`, never `parameter_list` —
// but a naive WORD-BOUNDARY regex match (the technique used elsewhere in this file for TYPE_LIKE_RE/FUNC_LIKE_RE)
// WOULD wrongly match `type_parameter_list` too, since `parameter_list` appears as its trailing `_`-separated
// segment sequence. The fix uses an EXACT node-type-string set (`PRIMARY_CTOR_CHILD_TYPES`) instead of a regex for
// this specific check, which cannot collide with `type_parameter_list`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParser, bindingFor, extractScopes, mine, report, verbalize } from '../engine/core.mjs';

async function typeScope(ext, src, name) {
  const p = await getParser(ext); const b = bindingFor(p._g); const tree = p.parse(src);
  return extractScopes('X' + ext, tree, b, p._g).find(s => s.kind === 'type' && s.name === name);
}

// ===== C# =====

test('C#: a class with only a primary constructor is `primary`', async () => {
  const s = await typeScope('.cs', 'public class Foo(IBar bar) : Base { }', 'Foo');
  assert.equal(s.nt, 'class_declaration');
  assert.equal(s.preds['auto.ctorshape'], 'primary');
});

test('C#: a class with only a classic constructor is `classic`', async () => {
  const s = await typeScope('.cs', 'public class Foo { public Foo(int x) { } }', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'classic');
});

test('C#: a class with both a primary and a chained classic constructor is `both`', async () => {
  const s = await typeScope('.cs', 'public class Foo(IBar bar) { public Foo(int x, IBar bar2) : this(bar2) {} }', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'both');
});

test('C#: a static-only class with neither kind of constructor is `none`', async () => {
  const s = await typeScope('.cs', 'public class Foo { public static void Bar() {} }', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'none');
});

test('C#: an interface (no constructor concept at all) is `none`', async () => {
  const s = await typeScope('.cs', 'public interface IFoo { void Bar(); }', 'IFoo');
  assert.equal(s.preds['auto.ctorshape'], 'none');
});

test('C#: a destructor alone does not count as a classic constructor — `none`, not `classic`', async () => {
  const s = await typeScope('.cs', 'public class Foo { ~Foo() {} }', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'none');
});

test('C#: a bodiless positional record\'s header parameters ARE a primary constructor (`primary`), not silently dropped', async () => {
  // `record Foo(int X);` has no declaration_list at all — this exercises the `noBody` early-return path, which the
  // fix computes `auto.ctorshape` BEFORE, specifically so this case is not excluded from the fact.
  const s = await typeScope('.cs', 'public record Foo(int X);', 'Foo');
  assert.ok(s.noBody, 'sanity: this declaration must be bodiless');
  assert.equal(s.preds['auto.ctorshape'], 'primary');
});

test('C# — THE critical negative case: a generic class\'s `<T>` type parameters (`type_parameter_list`) must never be misdetected as a primary constructor', async () => {
  const s = await typeScope('.cs', 'public class Foo<T> : Base<T> { }', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'none', `type_parameter_list must not be confused with parameter_list: got ${s.preds['auto.ctorshape']}`);
});

test('C#: a generic class WITH an explicit classic constructor is `classic`, not `primary` (generic params + real ctor together)', async () => {
  const s = await typeScope('.cs', `public class SearchQueryValidator<TColumnId, TFilter, TResponse, TQuery, TFilterValidator>
    : AbstractValidator<TQuery>
    where TColumnId : struct, Enum
{
    public SearchQueryValidator() {}
}
`, 'SearchQueryValidator');
  assert.equal(s.preds['auto.ctorshape'], 'classic');
});

// ===== Kotlin =====

test('Kotlin: a class with only a primary constructor is `primary`', async () => {
  const s = await typeScope('.kt', 'class Foo(val x: Int) : Base(x) { }', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'primary');
});

test('Kotlin: a class with no constructor is `none`', async () => {
  const s = await typeScope('.kt', 'class Foo { }', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'none');
});

test('Kotlin: a class with only a secondary (classic) constructor is `classic`', async () => {
  const s = await typeScope('.kt', 'class Foo { constructor(x: Int) { } }', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'classic');
});

test('Kotlin: a class with both a primary and a chained secondary constructor is `both`', async () => {
  const s = await typeScope('.kt', 'class Foo(val x: Int) { constructor(y: String) : this(y.length) }', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'both');
});

test('Kotlin: a generic class\'s `<T>` (type_parameters) with no primary constructor must not be misdetected as `primary`', async () => {
  const s = await typeScope('.kt', 'class Foo<T> { }', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'none');
});

// ===== Scala (a genuine third language confirmed by cross-grammar survey) =====

test('Scala: a bodiless case class\'s header parameters ARE a primary constructor (`primary`)', async () => {
  const s = await typeScope('.scala', 'case class Foo(x: Int)', 'Foo');
  assert.ok(s.noBody, 'sanity: a parenless-body case class is bodiless');
  assert.equal(s.preds['auto.ctorshape'], 'primary');
});

test('Scala: a plain class with constructor-shaped header parameters is also `primary` (not only `case class`)', async () => {
  const s = await typeScope('.scala', 'class Foo(x: Int) { }', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'primary');
});

test('Scala: a class with no constructor parameters is `none`', async () => {
  const s = await typeScope('.scala', 'class Foo { }', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'none');
});

test('Scala: a generic class\'s `[T]` (type_parameters field) with no constructor params must not be misdetected as `primary`', async () => {
  const s = await typeScope('.scala', 'class Foo[T] { }', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'none');
});

// ===== Java / Groovy records (a fourth confirmed language pattern: `parameters` field on `record_declaration` alone) =====

test('Java: a record\'s header parameters ARE a primary constructor (`primary`)', async () => {
  const s = await typeScope('.java', 'record Foo(int x) {}', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'primary');
});

test('Java: an ordinary class with an explicit constructor is `classic`, never confused with a record\'s primary constructor', async () => {
  const s = await typeScope('.java', 'class Foo { Foo(int x) {} }', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'classic');
});

test('Java: a generic class with no constructor is `none`, not `primary` (record_declaration-only gate must not leak to class_declaration)', async () => {
  const s = await typeScope('.java', 'class Foo<T> { }', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'none');
});

test('Groovy: a record\'s header parameters ARE a primary constructor (`primary`)', async () => {
  const s = await typeScope('.groovy', 'record Foo(int x) {}', 'Foo');
  assert.equal(s.preds['auto.ctorshape'], 'primary');
});

// ===== languages confirmed to have NO such concept (bodyless/no-primary-ctor sanity, not exhaustive) =====

test('Python: a class is never `primary` — Python has no primary-constructor concept in this grammar', async () => {
  const s = await typeScope('.py', 'class Foo:\n    def __init__(self, x):\n        pass\n', 'Foo');
  assert.notEqual(s.preds['auto.ctorshape'], 'primary');
});

test('Rust: a struct is never `primary` — Rust has no primary-constructor concept in this grammar', async () => {
  const s = await typeScope('.rs', 'struct Foo { x: i32 }', 'Foo');
  assert.notEqual(s.preds['auto.ctorshape'], 'primary');
});

test('Go: a struct type never carries `primary` — Go has no primary-constructor concept in this grammar (note: `type_declaration` is not even extracted as a scope here, a separate, pre-existing, out-of-scope fact)', async () => {
  const p = await getParser('.go'); const b = bindingFor(p._g); const tree = p.parse('type Foo struct { X int }');
  const scopes = extractScopes('X.go', tree, b, p._g);
  assert.ok(!scopes.some(s => s.preds['auto.ctorshape'] === 'primary'));
});

// ===== isBool / categorical pipeline: no special-casing needed =====

test('auto.ctorshape is categorical, not boolean — it must not be swallowed by isBool', async () => {
  const { isBool } = await import('../engine/core.mjs');
  assert.equal(isBool('auto.ctorshape'), false);
});

// ===== end-to-end migration visibility: mine()/report()/verbalize() see the split for free =====
// A hand-built model (mine() only ever needs `s.preds`/`s.kind`/`s.rel`, exactly as built from real parsing above) —
// mirroring the real field-report split: 50 classes on the new primary-constructor style, 434 still classic, in one
// package. Before this fix that population carried NO constructor-shape fact at all (the primary-constructor half
// was invisible); after it, `report` states which side is the established practice.

test('report() states a ctorshape convention for a package mid-migration (50 primary vs 434 classic), with no bespoke wiring beyond the generic categorical pipeline', () => {
  const ps = [];
  for (let i = 0; i < 50; i++) ps.push({ kind: 'type', rel: `src/migration/Primary${i}.cs`, name: `Primary${i}`, line: 1, preds: { 'auto.ctorshape': 'primary' } });
  for (let i = 0; i < 434; i++) ps.push({ kind: 'type', rel: `src/migration/Classic${i}.cs`, name: `Classic${i}`, line: 1, preds: { 'auto.ctorshape': 'classic' } });
  const { facts } = mine(ps, { assign: new Map(), amb: new Set() }, () => 1, [], null, null, {});
  const f = facts.find(x => x.pid === 'auto.ctorshape' && x.cid === '_all:type');
  assert.ok(f, `expected an accepted auto.ctorshape fact: ${JSON.stringify(facts.map(x => x.pid))}`);
  assert.equal(f.exp, 'classic', 'the majority (434/484) must be named the established practice');
  assert.ok(f.bpi > 0, `expected positive per-instance evidence: bpi=${f.bpi}`); // mine() only ever pushes a fact past its internal `bits > 0` codelength gate — bpi (bits/instance) is what it exposes on the fact

  assert.equal(verbalize(f, []), 'types here declare their constructor as a classic body constructor');

  const exportFacts = facts.map(x => ({ cid: x.cid, kind: x.kind, pid: x.pid, exp: x.exp, share: +x.srawShare.toFixed(3), sraw: x.sraw, bpi: +x.bpi.toFixed(2),
    deviantsN: Math.max(0, Math.round(x.sraw * (1 - x.srawShare))), exemplars: x.conform.slice(0, 3).map(gi => ({ rel: ps[gi].rel, line: ps[gi].line, name: ps[gi].name })),
    held: null, trend: undefined, alphabet: x.alphabet, counts: x.counts }));
  const model = { partitions: [{ name: 'src/migration', scopes: ps.length, medoids: [], files: [...new Set(ps.map(s => s.rel))], facts: exportFacts, templates: [] }], cochange: [], agentShare: null };
  const lines = report(model, { top: 15 });
  const text = lines.join('\n');
  assert.match(text, /declare their constructor as a classic body constructor/, text);
  assert.match(text, /\d+% of 484 established/, text);
});
