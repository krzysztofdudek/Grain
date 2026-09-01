// Tests for issues 014 and 021 — two extraction gaps, both fixed the same way: derive the missing surface from
// the grammar's OWN node-types.json metadata, never a hardcoded per-language node/field name.
//
// 014 — Go package-level `const`/`var` were never extracted at all (`what ErrorTypePrivate` etc. answered
// "has no declarations or values anywhere" on real gin symbols). Root cause: Go's `const_spec`/`var_spec` have a
// `name` field and a `value` field but NO `body` field, so `bindingFor`'s existing scope rule (`f.body &&
// (f.name || f.declarator)`) never adds them to `b.scope`, and the pre-existing value scan only recognised enum
// members (`ENUM_LIKE_RE`). Fix: `bindingFor` derives a new `b.namedValueSpec` set — node types whose `name`
// field is itself declared `multiple: true` (can bind SEVERAL identifiers, `a, b := f()`) and which carry a
// `value` field but no `body`. Measured against every shipped grammar's own name+value-no-body node (JS/TS
// `variable_declarator`, Python `keyword_argument`/`named_expression`, Rust `const_item`, PHP `enum_case`, C#
// `enum_member_declaration`, …): every one of those binds exactly ONE name. Only Go's const/var spec declares
// `name.multiple: true`, so the derivation fires there and nowhere else — never a Go node-name check.
// This deliberately does NOT turn const/var into scopes (`defined:`) — cross-check-honest-silence.test.mjs's own
// precondition (p4) asserts a Go const must never become a declared scope anywhere. It is captured through the
// existing VALUE surface instead (`vals` / `model.valueIndex`), exactly like an enum member already is: a name
// with no behaviour of its own, findable by `what`, single- and grouped-form alike, siblings grouped by their
// shared `const_declaration`/`var_declaration`/`var_spec_list` parent.
//
// 021 — C# never recorded a return type at all: `extractScopes` looked for a `result`/`return_type`/`type` field
// (in that order), but `method_declaration` — the single most common C# scope — names its field `returns`, so
// `s.rets` was always empty for ordinary C# methods (`local_function_statement`/`operator_declaration`/
// `conversion_operator_declaration` already worked, coincidentally, via the `type` fallback). Fix: `bindingFor`
// derives a per-node-type `b.retField` map. A "callable" node (declares both a `body` field and a `parameters`
// field) has its result field found by asking node-types.json which of its OWN remaining fields (excluding the
// structural ones: body/name/parameters/type_parameters/receiver/attributes) admits a child node whose type names
// "type" as a whole word segment (`type`, `_simple_type`, `type_annotation`, `bottom_type`, `type_identifier`, …).
// This reproduces every previously-hardcoded name (Go `result`, TS/PHP/Rust/Scala `return_type`, Java/Groovy/C#
// `type`) AND newly discovers C#'s own `returns` — without ever adding `'returns'` as a fourth hardcoded string.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getParser, bindingFor, extractScopes } from '../engine/core.mjs';
import { GRAMMARS } from '../engine/config.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const wIn = (dir, rel, content) => { mkdirSync(join(dir, dirname(rel)), { recursive: true }); writeFileSync(join(dir, rel), content); };
const statusIn = dir => { const r = spawnSync('node', [BIN, 'status'], { cwd: dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const modelIn = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));
const grainIn = (dir, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' }); return (r.stdout || '').replace(/\n$/, ''); };

async function scopesOf(ext, src) {
  const p = await getParser(ext); const b = bindingFor(p._g); const tree = p.parse(src);
  const out = extractScopes('X' + ext, tree, b, p._g); tree.delete(); return out;
}
async function fileVals(ext, src) { const s = (await scopesOf(ext, src)).find(s => s.kind === 'file'); return s.vals || []; }

// =====================================================================================================
// 014 — direct extraction: single-line and grouped Go const/var
// =====================================================================================================

test('014: a single-line package-level `const` is captured as a value, never as a scope', async () => {
  const src = `package zq\n\nconst ZqSingle = 1\n\nfunc ZqFunc() int { return ZqSingle }\n`;
  const scopes = await scopesOf('.go', src);
  assert.ok(scopes.some(s => s.kind === 'method' && s.name === 'ZqFunc'), 'the real function must still extract, proving the file is not zero-scope');
  assert.ok(!scopes.some(s => s.name === 'ZqSingle'), '`ZqSingle` must never be a scope of any kind (014\'s own precondition)');
  const vals = await fileVals('.go', src);
  const hit = vals.find(v => v.v === 'ZqSingle');
  assert.ok(hit, `ZqSingle must appear in the file's vals: ${JSON.stringify(vals)}`);
  assert.equal(hit.k, 'const');
});

test('014: a grouped `const ( A; B )` block\'s members are each individually captured, as siblings', async () => {
  const src = `package zq\n\nconst (\n\tZqBlockA = 1\n\tZqBlockB = 2\n)\n`;
  const vals = await fileVals('.go', src);
  const a = vals.find(v => v.v === 'ZqBlockA'), b = vals.find(v => v.v === 'ZqBlockB');
  assert.ok(a && b, `both grouped members must be captured: ${JSON.stringify(vals)}`);
  assert.equal(a.k, 'const'); assert.equal(b.k, 'const');
  assert.equal(a.c, b.c, 'members of the same grouped block share one container (siblings)');
});

test('014: `a, b = 1, 2` (one spec, several names) captures every bound name', async () => {
  const vals = await fileVals('.go', `package zq\n\nconst (\n\tZqMultiA, ZqMultiB = 1, 2\n)\n`);
  const names = vals.map(v => v.v).sort();
  assert.deepEqual(names, ['ZqMultiA', 'ZqMultiB']);
});

test('014: a `var` block is captured the same way, tagged `var` not `const`', async () => {
  const src = `package zq\n\nvar (\n\tZqVarA = "x"\n\tZqVarB = "y"\n)\n\nvar ZqVarSolo = 5\n`;
  const vals = await fileVals('.go', src);
  const a = vals.find(v => v.v === 'ZqVarA'), b = vals.find(v => v.v === 'ZqVarB'), solo = vals.find(v => v.v === 'ZqVarSolo');
  assert.ok(a && b && solo, `all three var names must be captured: ${JSON.stringify(vals)}`);
  assert.equal(a.k, 'var'); assert.equal(b.k, 'var'); assert.equal(solo.k, 'var');
  assert.equal(a.c, b.c, 'the grouped var block\'s members are siblings');
  assert.notEqual(solo.c, a.c, 'the single-line var is its own container, not a sibling of the unrelated block');
});

// =====================================================================================================
// 014 — end to end: `grain what` actually surfaces a Go const/var once its document frequency clears the floor
// =====================================================================================================

let tmp, repo;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-declaration-extraction-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main'); gitIn(repo, 'config', 'commit.gpgsign', 'false');
  // the same name/value declared in TWO files clears CFG.valueDfMin (=2) and is a real cross-file concordance,
  // not merely the df=1 "seen but gated" shape cross-check-honest-silence.test.mjs already covers
  wIn(repo, 'src/goconst/one.go', 'package p\n\nconst ZqEndToEndConst = 1\n');
  wIn(repo, 'src/goconst/two.go', 'package p\n\nconst ZqEndToEndConst = 2\n');
  wIn(repo, 'src/goblock/one.go', 'package p\n\nconst (\n\tZqEndToEndBlockA = 1\n\tZqEndToEndBlockB = 2\n)\n');
  wIn(repo, 'src/goblock/two.go', 'package p\n\nconst (\n\tZqEndToEndBlockA = 10\n\tZqEndToEndBlockB = 20\n)\n');
  wIn(repo, 'src/govar/one.go', 'package p\n\nvar ZqEndToEndVar = "a"\n');
  wIn(repo, 'src/govar/two.go', 'package p\n\nvar ZqEndToEndVar = "b"\n');
  // filler, so dfMax = ceil(0.2 * files) sits comfortably above df=2 for every value above
  for (let i = 1; i <= 14; i++) wIn(repo, `src/filler/f${i}.ts`, `export function filler${i}(): number { return ${i}; }\n`);
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'declaration-extraction fixture');
  statusIn(repo);
});

test('014 (end-to-end): model.files is exactly 20, so dfMax = ceil(0.2*20) = 4 covers every df=2 case below', () => {
  assert.equal(modelIn(repo).files, 20);
});

test('014 (end-to-end): a package-level const with df=2 is a real model.valueIndex entry', () => {
  const m = modelIn(repo);
  assert.deepEqual(m.valueIndex['const:ZqEndToEndConst'], [['src/goconst/one.go', 3], ['src/goconst/two.go', 3]]);
});

test('014 (end-to-end): both grouped block members are indexed, each with df=2', () => {
  const m = modelIn(repo);
  assert.deepEqual(m.valueIndex['const:ZqEndToEndBlockA'], [['src/goblock/one.go', 4], ['src/goblock/two.go', 4]]);
  assert.deepEqual(m.valueIndex['const:ZqEndToEndBlockB'], [['src/goblock/one.go', 5], ['src/goblock/two.go', 5]]);
});

test('014 (end-to-end): a package-level var is indexed under kind `var`', () => {
  const m = modelIn(repo);
  assert.deepEqual(m.valueIndex['var:ZqEndToEndVar'], [['src/govar/one.go', 3], ['src/govar/two.go', 3]]);
});

test('014 (end-to-end): `grain what` itself names the const as a value, not a declaration', () => {
  const out = grainIn(repo, ['what', 'ZqEndToEndConst']);
  assert.match(out, /values: `ZqEndToEndConst` in 2 places \(const\)/, out);
  assert.doesNotMatch(out, /defined:/, `must never be reported as a declared scope: ${out}`);
});

after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

// =====================================================================================================
// 021 — direct extraction: C# `method_declaration`'s own `returns` field
// =====================================================================================================

test('021: `Task<Result<T>> Handle(...)` records the outer declared type in s.rets', async () => {
  const src = `using System.Threading.Tasks;\nclass ZqHandler {\n  public Task<Result<T>> Handle(ZqCommand c) {\n    return null;\n  }\n}\n`;
  const s = (await scopesOf('.cs', src)).find(s => s.kind === 'method' && s.name === 'Handle');
  assert.ok(s, 'Handle must extract as a method scope');
  assert.deepEqual(s.rets, ['Task']);
});

test('021: a plain predefined return type on an ordinary C# method is captured too', async () => {
  const s = (await scopesOf('.cs', `class ZqC { public int Foo() { return 1; } }\n`)).find(s => s.name === 'Foo');
  assert.deepEqual(s.rets, ['int']);
});

test('021: a void-returning method has no rets, and is not mistaken for a bug', async () => {
  const s = (await scopesOf('.cs', `class ZqC { public void Foo() { } }\n`)).find(s => s.name === 'Foo');
  assert.deepEqual(s.rets, ['void']);
});

// =====================================================================================================
// Regression, both fixes: every other shipped grammar's `retField` derivation and `namedValueSpec` set are
// pinned exactly — this is the guard 015 needed and didn't have (it over-broadened a similar field-derivation
// change and had to revert after breaking two unrelated tests). Any widening or narrowing of either derivation,
// for ANY grammar, fails here first.
// =====================================================================================================

test('regression: b.namedValueSpec is empty for every shipped grammar except go', () => {
  for (const g of GRAMMARS) {
    const b = bindingFor(g);
    if (g === 'go') assert.deepEqual([...b.namedValueSpec].sort(), ['const_spec', 'var_spec']);
    else assert.deepEqual([...b.namedValueSpec], [], `${g} must not pick up a namedValueSpec shape`);
  }
});

test('regression: b.retField is pinned exactly for every shipped grammar that has one', () => {
  const expected = {
    c_sharp: { conversion_operator_declaration: 'type', lambda_expression: 'type', local_function_statement: 'type', method_declaration: 'returns', operator_declaration: 'type' },
    go: { func_literal: 'result', function_declaration: 'result', method_declaration: 'result' },
    groovy: { function_definition: 'type', method_declaration: 'type' },
    java: { method_declaration: 'type' },
    php: { anonymous_function: 'return_type', arrow_function: 'return_type', function_definition: 'return_type', method_declaration: 'return_type' },
    python: { function_definition: 'return_type' },
    rust: { closure_expression: 'return_type', function_item: 'return_type' },
    scala: { function_definition: 'return_type', given_definition: 'return_type' },
    tsx: { arrow_function: 'return_type', function_declaration: 'return_type', function_expression: 'return_type', generator_function: 'return_type', generator_function_declaration: 'return_type', method_definition: 'return_type' },
    typescript: { arrow_function: 'return_type', function_declaration: 'return_type', function_expression: 'return_type', generator_function: 'return_type', generator_function_declaration: 'return_type', method_definition: 'return_type' } };
  for (const g of GRAMMARS) {
    const b = bindingFor(g);
    const got = Object.fromEntries(b.retField);
    assert.deepEqual(got, expected[g] || {}, `${g}'s retField map drifted`);
  }
});

// this is the exact scenario 015 broke: re-verify every language named-return-type.test.mjs already exercises,
// through the NEW derivation, byte-identical to before
test('regression: rets extraction is byte-identical across languages after both fixes', async () => {
  const cases = [
    ['.ts', `export function f(x: number): string { return String(x); }`, ['string']],
    ['.php', `<?php function f(int $x): string { return "$x"; }`, ['string']],
    ['.rs', `fn f(x: i32) -> String { x.to_string() }`, ['String']],
    ['.scala', `def f(x: Int): String = x.toString`, ['String']],
    ['.java', `class C { String f(int x) { return String.valueOf(x); } }`, ['String']],
    ['.py', `def f(x: int) -> str:\n    return str(x)\n`, ['str']],
    ['.go', `package main\nfunc f(x int) string { return "" }`, ['string']] ];
  for (const [ext, src, want] of cases) {
    const s = (await scopesOf(ext, src)).find(s => s.name === 'f');
    assert.deepEqual(s.rets, want, `${ext}: expected ${JSON.stringify(want)}, got ${JSON.stringify(s.rets)}`);
  }
  // languages with no static return-type surface: unaffected, still empty
  for (const [ext, src] of [['.kt', `fun f(x: Int): String { return x.toString() }`], ['.rb', `def f(x)\n  x.to_s\nend\n`]]) {
    const s = (await scopesOf(ext, src)).find(s => s.name === 'f');
    assert.deepEqual(s.rets, [], `${ext}: must stay empty (no structural return-type field)`);
  }
});
