// Four new categorical predicates (J5.6 / H6), each a plain key on a scope's `preds` object so that mine() picks
// them up through its existing generic categorical path with no special-casing anywhere:
//
//   (a) `auto.namesuffix`  — non-file scopes: the LAST token of the scope's own name, or 'none' below two tokens.
//   (b) `auto.lex:imports` — file scopes: `sorted|unsorted` × `grouped|flat`, gated at >= 3 imports.
//   (c) `auto.mods`        — non-file scopes: the sorted, deduped set of declaration modifiers, or 'none'.
//   (d) `auto.memberorder` — type scopes with a body: the run-length-compressed field/ctor/method layout.
//
// THE TRAP (a) EXISTS FOR — the same one J3.4 already found and fixed once, in its own `namedDifferently`
// computation: `nameTokens()` routes through `PL_STOP`, which contains EXACTLY the vocabulary a suffix convention is
// made of — `model`, `service`, `controller`, `component`, `view`, `type`, `module`, `config`. Computing a "suffix"
// through `nameTokens` therefore returns the word BEFORE the suffix (`InvoiceModel` -> `invoice`), i.e. a value that
// differs for every member of a perfectly uniform group, so the convention never certifies at all. `auto.namesuffix`
// uses plain `tokenize()`. The ticket's own proposed test (30 `*Handler` scopes) would NOT have caught this, because
// `handler` is not in `PL_STOP` — the `*Service`/`*Model` cases below are the ones that prove the fix.
//
// THE HONEST FRAMING OF (c): the modifier list is a fixed vocabulary of ENGLISH WORDS (the same category of thing as
// the existing `TYPE_LIKE_RE`/`FUNC_LIKE_RE`/`CTOR_LIKE_RE` — a list over NODE-TYPE names, never over language or
// framework names), FILTERED by what each grammar actually declares as an anonymous token. It is not "derived from
// the grammar" in any stronger sense: a `modifiers` node's `children.types` in `node-types.json` lists only its NAMED
// children, never the anonymous keywords. Measured hits of the 9-word list against the shipped grammars:
// java 6/9, c_sharp 7/9, typescript 8/9, kotlin 6/9, scala 6/9, php 6/9, cpp 6/9, rust 2/9, python 1/9, go 0/9.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getParser, bindingFor, extractScopes, lexicalPreds, fileLevelPreds, mine, verbalize, deviationPhrase } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');

async function scopesOf(ext, src) {
  const p = await getParser(ext); const b = bindingFor(p._g); const tree = p.parse(src);
  const out = extractScopes('src/pkg/X' + ext, tree, b, p._g); tree.delete(); return out;
}
const byName = (ss, name) => ss.find(s => s.name === name);
async function lexOf(ext, src) {
  const p = await getParser(ext); const b = bindingFor(p._g); const tree = p.parse(src);
  const out = lexicalPreds(tree, b); tree.delete(); return out;
}

// ===========================================================================================================
// (a) auto.namesuffix
// ===========================================================================================================

test('(a) namesuffix: the last token of a multi-token name', async () => {
  const ss = await scopesOf('.ts', 'export class OrderHandler {\n  fetchUserData() { return 1; }\n}\n');
  assert.equal(byName(ss, 'OrderHandler').preds['auto.namesuffix'], 'handler');
  assert.equal(byName(ss, 'fetchUserData').preds['auto.namesuffix'], 'data');
});

test('(a) namesuffix: a single-token name has no suffix — `none`, never an empty string', async () => {
  const ss = await scopesOf('.ts', 'export class Foo {\n  run() { return 1; }\n}\n');
  assert.equal(byName(ss, 'Foo').preds['auto.namesuffix'], 'none');
  assert.equal(byName(ss, 'run').preds['auto.namesuffix'], 'none');
});

test('(a) THE PL_STOP REGRESSION: `*Model`/`*Service`/`*Controller` suffixes survive — nameTokens() would have eaten every one of them', async () => {
  const ss = await scopesOf('.ts', ['export class InvoiceModel { a() { return 1; } }',
    'export class PaymentService { b() { return 1; } }',
    'export class BillingController { c() { return 1; } }',
    'export class AppConfig { d() { return 1; } }'].join('\n'));
  // every one of these four words is IN PL_STOP — under `nameTokens` these would read invoice/payment/billing/app
  assert.equal(byName(ss, 'InvoiceModel').preds['auto.namesuffix'], 'model');
  assert.equal(byName(ss, 'PaymentService').preds['auto.namesuffix'], 'service');
  assert.equal(byName(ss, 'BillingController').preds['auto.namesuffix'], 'controller');
  assert.equal(byName(ss, 'AppConfig').preds['auto.namesuffix'], 'config');
});

test('(a) namesuffix is set on the BODILESS branch too (a C# positional record)', async () => {
  const ss = await scopesOf('.cs', 'public record OrderRecord(int X);');
  const s = byName(ss, 'OrderRecord');
  assert.ok(s.noBody, 'sanity: this declaration must be bodiless');
  assert.equal(s.preds['auto.namesuffix'], 'record');
});

// mine() arithmetic, worked against the real λ gate (CFG.lambda = 8 => the KT posterior predictive bound is
// (ne + 0.5) / (neff + K/2) >= 1 - 1/8 = 0.875):
//   fixture = 30 scopes with suffix `service` + 2 with suffix `handler`  =>  |V| = 2, K = |V| + 1 = 3, neff = 32
//   bound   = (30 + 0.5) / (32 + 1.5) = 30.5 / 33.5 = 0.9104  >=  0.875  ✓ (margin +0.035)
//   bits    = 30·log2(0.9104·2) + 2·log2(0.0746·2) − 0.5·(3−1)·log2(32) − idxCost
//           = 25.94 − 5.49 − 5 − 1 = 14.45 > 0  ✓
// Under the `nameTokens`/PL_STOP bug the 30 `*Service` scopes would each yield their OWN distinct prefix instead,
// giving |V| = 32, K = 33, ne = 1 — nothing certifies, which is precisely the silent failure this pins.
test('(a) mine() certifies a `*Service` suffix convention — the exact case PL_STOP would have silenced', () => {
  const ps = [];
  const w = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa'];
  for (let i = 0; i < 30; i++) ps.push({ kind: 'type', rel: `src/app/${w[i % 10]}${i}.service.ts`, name: `X${i}Service`, line: 1, preds: { 'auto.namesuffix': 'service' } });
  for (let i = 0; i < 2; i++) ps.push({ kind: 'type', rel: `src/app/h${i}.ts`, name: `Y${i}Handler`, line: 1, preds: { 'auto.namesuffix': 'handler' } });
  const { facts } = mine(ps, { assign: new Map(), amb: new Set() }, () => 1, [], null, null, {});
  const f = facts.find(x => x.pid === 'auto.namesuffix' && x.cid === '_all:type');
  assert.ok(f, `expected an accepted auto.namesuffix fact: ${JSON.stringify(facts.map(x => x.pid))}`);
  assert.equal(f.exp, 'service');
  assert.equal(f.alphabet.length, 2, 'K = |V| + 1 = 3 — the arithmetic above depends on this');
  assert.ok(f.bpi > 0);
  assert.equal(verbalize(f, []), 'types here are named ending in `service`');
  assert.equal(deviationPhrase(f, 'handler'), 'is named ending in `handler`');
});

// ===========================================================================================================
// (b) auto.lex:imports
// ===========================================================================================================

const IMPORTS_UNSORTED_FLAT = "import { z } from 'zeta';\nimport { a } from 'alpha';\nimport { m } from 'mu';\nconst x = 1;\n";

test('(b) lex:imports — sorted specifiers, blank-line separated groups', async () => {
  const out = await lexOf('.ts', "import { a } from 'alpha';\nimport { b } from 'beta';\n\nimport { c } from 'gamma';\nimport { d } from 'zeta';\n\nconst x = 1;\n");
  assert.equal(out['auto.lex:imports'], 'sorted-grouped');
});

test('(b) lex:imports — unsorted specifiers, one flat block', async () => {
  assert.equal((await lexOf('.ts', IMPORTS_UNSORTED_FLAT))['auto.lex:imports'], 'unsorted-flat');
});

test('(b) lex:imports — sorted, one flat block', async () => {
  assert.equal((await lexOf('.ts', "import { a } from 'alpha';\nimport { b } from 'beta';\nimport { c } from 'gamma';\nconst x = 1;\n"))['auto.lex:imports'], 'sorted-flat');
});

test('(b) lex:imports — unsorted, grouped (the common "grouped by package, unsorted across groups" layout)', async () => {
  assert.equal((await lexOf('.ts', "import { z } from 'zeta';\nimport { y } from 'yankee';\n\nimport { a } from 'alpha';\nconst x = 1;\n"))['auto.lex:imports'], 'unsorted-grouped');
});

test('(b) lex:imports — below the 3-import gate the predicate is ABSENT, not `none`', async () => {
  const out = await lexOf('.ts', "import { a } from 'alpha';\nimport { b } from 'beta';\nconst x = 1;\n");
  assert.ok(!('auto.lex:imports' in out), `expected no value at 2 imports, got ${out['auto.lex:imports']}`);
});

test('(b) lex:imports — a Go grouped import block counts its `import_spec`s, not the one enclosing statement', async () => {
  // three specs inside ONE import_declaration: the units are the specs, and the blank line inside the block groups them
  assert.equal((await lexOf('.go', 'package main\n\nimport (\n\t"fmt"\n\t"os"\n\n\t"github.com/x/y"\n)\n\nfunc main() {}\n'))['auto.lex:imports'], 'unsorted-grouped');
  assert.equal((await lexOf('.go', 'package main\n\nimport (\n\t"aaa"\n\t"bbb"\n\t"ccc"\n)\n\nfunc main() {}\n'))['auto.lex:imports'], 'sorted-flat');
});

test('(b) lex:imports — Java import declarations, sorted and grouped', async () => {
  assert.equal((await lexOf('.java', 'package p;\n\nimport a.b.C;\nimport a.b.D;\n\nimport z.Y;\n\nclass F {}\n'))['auto.lex:imports'], 'sorted-grouped');
});

test('(b) lex:imports reaches the file scope through extractScopes and fileLevelPreds alike', async () => {
  const p = await getParser('.ts'); const b = bindingFor(p._g); const tree = p.parse(IMPORTS_UNSORTED_FLAT);
  const fileScope = extractScopes('src/pkg/a.ts', tree, b, p._g).find(s => s.kind === 'file');
  tree.delete();
  assert.equal(fileScope.preds['auto.lex:imports'], 'unsorted-flat');
  const fl = await fileLevelPreds('src/pkg/a.ts', IMPORTS_UNSORTED_FLAT);
  assert.equal(fl['auto.lex:imports'], 'unsorted-flat');
});

test('(b) lex:imports verbalizes and deviates readably', () => {
  const f = { pid: 'auto.lex:imports', exp: 'sorted-grouped', kind: 'file' };
  assert.equal(verbalize(f, []), 'files here sort imports, in blank-line-separated groups');
  assert.equal(deviationPhrase(f, 'unsorted-flat'), 'does not sort imports, in one block');
});

// ===========================================================================================================
// (c) auto.mods
// ===========================================================================================================

test('(c) mods — Java modifiers live under a `modifiers` holder node, two levels below the scope', async () => {
  const ss = await scopesOf('.java', 'public class Foo {\n  private int x;\n  public void bar() {}\n  protected static int baz() { return 1; }\n}\n');
  assert.equal(byName(ss, 'Foo').preds['auto.mods'], 'public');
  assert.equal(byName(ss, 'bar').preds['auto.mods'], 'public');
  assert.equal(byName(ss, 'baz').preds['auto.mods'], 'protected,static');
});

test('(c) mods — the value is SORTED, so source order cannot change it (determinism)', async () => {
  const a = await scopesOf('.java', 'class Foo {\n  public static void bar() {}\n}\n');
  const b = await scopesOf('.java', 'class Foo {\n  static public void bar() {}\n}\n');
  assert.equal(byName(a, 'bar').preds['auto.mods'], 'public,static');
  assert.equal(byName(b, 'bar').preds['auto.mods'], 'public,static');
});

test('(c) mods — C# repeats a `modifier` node per keyword', async () => {
  const ss = await scopesOf('.cs', 'public class Foo {\n  public async Task Bar() { }\n  protected override void Baz() { }\n}\n');
  assert.equal(byName(ss, 'Bar').preds['auto.mods'], 'async,public');
  assert.equal(byName(ss, 'Baz').preds['auto.mods'], 'override,protected');
});

test('(c) mods — TypeScript mixes a NAMED accessibility_modifier with BARE anonymous `static`/`async` tokens', async () => {
  const ss = await scopesOf('.ts', 'export class Foo {\n  public async bar() { return 1; }\n  protected static baz() { return 1; }\n  qux() { return 1; }\n}\n');
  assert.equal(byName(ss, 'bar').preds['auto.mods'], 'async,public');
  assert.equal(byName(ss, 'baz').preds['auto.mods'], 'protected,static');
  assert.equal(byName(ss, 'qux').preds['auto.mods'], 'none');
});

test('(c) mods — Kotlin buries the keyword THREE levels down (modifiers > visibility_modifier > private)', async () => {
  const ss = await scopesOf('.kt', 'class Foo {\n  fun bar() {}\n  override protected fun baz() {}\n}\n');
  assert.equal(byName(ss, 'baz').preds['auto.mods'], 'override,protected');
  assert.equal(byName(ss, 'bar').preds['auto.mods'], 'none');
});

test('(c) mods — PHP wraps each keyword in its own named `*_modifier` node', async () => {
  const ss = await scopesOf('.php', '<?php class Foo {\n  public function bar() {}\n  private static function baz() {}\n}\n');
  assert.equal(byName(ss, 'bar').preds['auto.mods'], 'public');
  assert.equal(byName(ss, 'baz').preds['auto.mods'], 'private,static');
});

test('(c) mods — Python sees only `async` (1 of the 9 words is an anonymous token in its grammar)', async () => {
  const ss = await scopesOf('.py', 'class Foo:\n    async def bar(self): pass\n    def baz(self): pass\n');
  assert.equal(byName(ss, 'bar').preds['auto.mods'], 'async');
  assert.equal(byName(ss, 'baz').preds['auto.mods'], 'none');
});

test('(c) THE VACUITY CASE: Go declares NONE of the nine words as an anonymous token — every scope must read `none`, never `\'\'`', async () => {
  const ss = await scopesOf('.go', 'package main\n\ntype Foo struct { A int }\n\nfunc Bar() {}\nfunc Baz() int { return 1 }\n');
  for (const s of ss) {
    if (s.kind === 'file' || s.kind === 'module') continue;
    assert.equal(s.preds['auto.mods'], 'none', `${s.name}: expected the literal 'none'`);
    assert.notEqual(s.preds['auto.mods'], '', 'an empty string would slip past mine()\'s vacuity gate, which rejects only other/none/mixed/?');
  }
});

// mine() arithmetic, worked against the real λ gate (bound = (ne + 0.5)/(neff + K/2) >= 0.875):
//   THIS fixture — 28 `private` + 2 `public`, i.e. 2 DISTINCT modifier sets => |V| = 2, K = 3, neff = 30
//     bound = 28.5 / (30 + 1.5) = 28.5 / 31.5 = 0.9048  >= 0.875  ✓  (margin +0.030)
//     bits  = 28·log2(0.9048·2) + 2·log2(0.0794·2) − 0.5·2·log2(30) − idxCost = 18.65 − 4.91 − 1 = 12.74 > 0 ✓
//   The knife edge the review measured, for the record — the SAME 28/30 majority at a wider alphabet:
//     3 distinct sets => K = 4: 28.5 / 32 = 0.8906  ✓ by only 0.016
//     5 distinct sets => K = 6: 28.5 / 33 = 0.8636  ✗ silent
//   The number of distinct modifier SETS is therefore the fixture's controlled variable, not an accident.
test('(c) mine() certifies `private` on 28 of 30 methods, at a deliberately controlled alphabet size', () => {
  const ps = [];
  for (let i = 0; i < 28; i++) ps.push({ kind: 'method', rel: `src/svc/a${i}.java`, name: `m${i}`, line: 1, preds: { 'auto.mods': 'private' } });
  for (let i = 0; i < 2; i++) ps.push({ kind: 'method', rel: `src/svc/b${i}.java`, name: `p${i}`, line: 1, preds: { 'auto.mods': 'public' } });
  const { facts } = mine(ps, { assign: new Map(), amb: new Set() }, () => 1, [], null, null, {});
  const f = facts.find(x => x.pid === 'auto.mods' && x.cid === '_all:method');
  assert.ok(f, `expected an accepted auto.mods fact: ${JSON.stringify(facts.map(x => x.pid))}`);
  assert.equal(f.exp, 'private');
  assert.equal(f.alphabet.length, 2, 'the λ arithmetic in the comment above is pinned to exactly 2 distinct modifier sets');
  assert.equal(verbalize(f, []), 'methods here carry the modifiers `private`');
  assert.equal(deviationPhrase(f, 'public'), 'carries the modifiers `public`');
});

test('(c) `none` never certifies: an all-`none` population produces no vacuous auto.mods fact', () => {
  const ps = [];
  for (let i = 0; i < 40; i++) ps.push({ kind: 'method', rel: `src/go/a${i}.go`, name: `m${i}`, line: 1, preds: { 'auto.mods': 'none' } });
  const { facts } = mine(ps, { assign: new Map(), amb: new Set() }, () => 1, [], null, null, {});
  assert.equal(facts.filter(x => x.pid === 'auto.mods').length, 0, 'an all-`none` population is a non-choice and must stay silent');
});

// ===========================================================================================================
// (d) auto.memberorder
// ===========================================================================================================
//
// COMPRESSION GRAMMAR (exact, and the reason the ticket's own `f+c m+` sketch had to be pinned down):
//   letter   := 'f' (FIELD_LIKE_RE) | 'c' (CTOR_LIKE_RE) | 'm' (FUNC_LIKE_RE), tested in THAT order
//   sequence := the classified DIRECT named children of the type body, in source order; a child matching none of
//               the three is skipped entirely and leaves no trace in the pattern
//   run      := a maximal sub-sequence of identical letters
//   token    := <letter>      for a run of exactly 1
//             | <letter> '+'  for a run of 2 or more   ('+' means "two or more", NEVER an exact count)
//   pattern  := tokens joined by exactly ONE space          e.g.  f f c m m  ->  'f+ c m+'
//   the empty sequence -> 'none'; more than 6 runs -> the first 6 tokens plus a final '…' token
// "Round-trips" means the STRING parses back to its run structure uniquely (split on ' '; a trailing '+' means
// "run >= 2") — exact run lengths are discarded on purpose: they are what would blow the alphabet up, and
// K = |alphabet| + 1 sits directly inside mine()'s λ bound.

test('(d) memberorder — Java fields, then a constructor, then methods', async () => {
  const ss = await scopesOf('.java', 'public class Foo {\n  private int a;\n  private int b;\n  public Foo() {}\n  public void x() {}\n  public void y() {}\n}\n');
  assert.equal(byName(ss, 'Foo').preds['auto.memberorder'], 'f+ c m+');
});

test('(d) memberorder — a run of exactly one renders WITHOUT a `+`', async () => {
  const ss = await scopesOf('.java', 'public class Foo {\n  private int a;\n  public void x() {}\n}\n');
  assert.equal(byName(ss, 'Foo').preds['auto.memberorder'], 'f m');
});

test('(d) memberorder — a ONE-CATEGORY body has no order to state: `none`, not `m+`', async () => {
  // "types here order their members `m+`" would claim nothing but "these types hold only methods" — a composition
  // fact wearing an ordering fact's words. Below two runs the predicate collapses to 'none' and mine() drops it.
  const ss = await scopesOf('.java', 'public class Foo {\n  public void x() {}\n  public void y() {}\n  public void z() {}\n}\n');
  assert.equal(byName(ss, 'Foo').preds['auto.memberorder'], 'none');
});

test('(d) memberorder — an interleaved layout keeps every run boundary', async () => {
  const ss = await scopesOf('.java', 'public class Foo {\n  private int a;\n  public void x() {}\n  private int b;\n  public void y() {}\n}\n');
  assert.equal(byName(ss, 'Foo').preds['auto.memberorder'], 'f m f m');
});

test('(d) memberorder — C# counts `property_declaration` as a field-like member', async () => {
  const ss = await scopesOf('.cs', 'public class Foo {\n  private int _a;\n  public string Name { get; set; }\n  public Foo() {}\n  public void X() {}\n}\n');
  assert.equal(byName(ss, 'Foo').preds['auto.memberorder'], 'f+ c m');
});

test('(d) memberorder — Kotlin (`property_declaration` / `secondary_constructor` / `function_declaration`)', async () => {
  const ss = await scopesOf('.kt', 'class Foo {\n  private val a: Int = 1\n  constructor() {}\n  fun x() {}\n  fun y() {}\n}\n');
  assert.equal(byName(ss, 'Foo').preds['auto.memberorder'], 'f c m+');
});

test('(d) memberorder — PHP (`property_declaration` / `const_declaration` are both field-like)', async () => {
  const ss = await scopesOf('.php', '<?php class Foo {\n  private int $x = 1;\n  const Y = 2;\n  public function bar() {}\n}\n');
  assert.equal(byName(ss, 'Foo').preds['auto.memberorder'], 'f+ m');
});

test('(d) memberorder — a type whose body holds nothing classifiable is `none`, and methods never carry the predicate', async () => {
  const ss = await scopesOf('.py', 'class Foo:\n    X = 1\n    Y = 2\n');
  assert.equal(byName(ss, 'Foo').preds['auto.memberorder'], 'none');
  const ts = await scopesOf('.java', 'public class Foo {\n  public void bar() {}\n}\n');
  assert.ok(!('auto.memberorder' in byName(ts, 'bar').preds), 'auto.memberorder is a TYPE-level predicate only');
});

test('(d) memberorder — a layout past 6 runs is truncated with a trailing `…`, keeping the alphabet bounded', async () => {
  const members = [];
  for (let i = 0; i < 5; i++) members.push(`  private int f${i};`, `  public void m${i}() {}`); // f m f m f m f m f m = 10 runs
  const ss = await scopesOf('.java', `public class Foo {\n${members.join('\n')}\n}\n`);
  assert.equal(byName(ss, 'Foo').preds['auto.memberorder'], 'f m f m f m …');
});

test('(d) memberorder — the pattern is stable across repeated parses of the same source', async () => {
  const src = 'public class Foo {\n  private int a;\n  private int b;\n  public Foo() {}\n  public void x() {}\n}\n';
  const first = byName(await scopesOf('.java', src), 'Foo').preds['auto.memberorder'];
  const second = byName(await scopesOf('.java', src), 'Foo').preds['auto.memberorder'];
  assert.equal(first, second);
  // and it parses back to its run structure unambiguously, per the documented grammar
  assert.deepEqual(first.split(' ').map(t => ({ letter: t[0], atLeast: t.endsWith('+') ? 2 : 1 })),
    [{ letter: 'f', atLeast: 2 }, { letter: 'c', atLeast: 1 }, { letter: 'm', atLeast: 1 }]);
});

// mine() arithmetic (bound = (ne + 0.5)/(neff + K/2) >= 0.875):
//   30 types laid out `f+ c m+` + 2 laid out `c m+`  =>  |V| = 2, K = 3, neff = 32
//   bound = 30.5 / 33.5 = 0.9104 >= 0.875 ✓ (margin +0.035)
test('(d) mine() certifies a consistent member layout against a varying minority', () => {
  const ps = [];
  for (let i = 0; i < 30; i++) ps.push({ kind: 'type', rel: `src/dom/A${i}.java`, name: `A${i}`, line: 1, preds: { 'auto.memberorder': 'f+ c m+' } });
  for (let i = 0; i < 2; i++) ps.push({ kind: 'type', rel: `src/dom/B${i}.java`, name: `B${i}`, line: 1, preds: { 'auto.memberorder': 'c m+' } });
  const { facts } = mine(ps, { assign: new Map(), amb: new Set() }, () => 1, [], null, null, {});
  const f = facts.find(x => x.pid === 'auto.memberorder' && x.cid === '_all:type');
  assert.ok(f, `expected an accepted auto.memberorder fact: ${JSON.stringify(facts.map(x => x.pid))}`);
  assert.equal(f.exp, 'f+ c m+');
  assert.equal(verbalize(f, []), 'types here order their members `f+ c m+`');
  assert.equal(deviationPhrase(f, 'c m+'), 'orders its members `c m+`');
});

// ===========================================================================================================
// (e) regression: lexicalPreds' OTHER predicates, through its new (tree, b) signature and BOTH call sites
// ===========================================================================================================

const LEX_SRC = ["'use strict';", "import { a } from 'alpha';", "const x = 'one';", "const y = 'two';",
  'function f() {', "  const p = 'p';", "  const q = 'q';", '  if (p) {', '    return q;', '  }', '  return p + q;', '}', ''].join('\n');

test('(e) regression — quote/semi/indent/decl/bom/directive all survive the lexicalPreds(tree, b) signature change', async () => {
  const out = await lexOf('.ts', LEX_SRC);
  assert.equal(out['auto.lex:quote'], 'single');
  assert.equal(out['auto.lex:semi'], 'semi');
  assert.equal(out['auto.lex:indent'], 'space2');
  assert.equal(out['auto.lex:decl'], 'const');
  assert.equal(out['auto.lex:bom'], 'none');
  assert.equal(out['auto.lex:directive'], 'use strict');
});

test('(e) regression — BOTH call sites pass `b`: extractScopes\' file scope and fileLevelPreds agree exactly', async () => {
  const p = await getParser('.ts'); const b = bindingFor(p._g); const tree = p.parse(LEX_SRC);
  const fileScope = extractScopes('src/pkg/a.ts', tree, b, p._g).find(s => s.kind === 'file');
  tree.delete();
  const fl = await fileLevelPreds('src/pkg/a.ts', LEX_SRC);
  for (const pid of ['auto.lex:quote', 'auto.lex:semi', 'auto.lex:indent', 'auto.lex:decl', 'auto.lex:bom', 'auto.lex:directive'])
    assert.equal(fileScope.preds[pid], fl[pid], pid);
});

// ===========================================================================================================
// (f) determinism: an incremental rebuild reuses the extraction cache — the four values must be byte-identical
// ===========================================================================================================

test('(f) determinism — a full build and an incremental rebuild agree byte-for-byte on all four predicates', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'grain-newpreds-'));
  try {
    const repo = join(tmp, 'r'); mkdirSync(repo);
    const env = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
    const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } });
    const w = (rel, c) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), c); };
    git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
    for (let i = 0; i < 12; i++) w(`src/svc/Item${i}Service.java`,
      `package svc;\n\nimport a.Alpha;\nimport b.Beta;\n\nimport z.Zeta;\n\npublic class Item${i}Service {\n  private int a;\n  private int b;\n  public Item${i}Service() {}\n  public void run() {}\n  public void stop() {}\n}\n`);
    git('add', '-A'); git('commit', '-qm', 'add services');
    const run = () => { const r = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(r.status, 0, r.stdout + r.stderr); };

    const PIDS = ['auto.namesuffix', 'auto.mods', 'auto.memberorder', 'auto.lex:imports'];
    const snapshot = () => {
      const cache = JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'tree.json'), 'utf8'));
      const out = {};
      for (const [k, v] of Object.entries(cache).sort((a, b) => a[0] < b[0] ? -1 : 1))
        for (const s of v.s) out[k + '#' + s.kind + '#' + s.name] = PIDS.map(p => s.preds[p] ?? null);
      return out;
    };

    run();                                          // full build: nothing cached, every file parsed
    const full = snapshot();
    assert.ok(Object.keys(full).length >= 12, 'sanity: the cache must hold the extracted scopes');
    assert.ok(Object.values(full).some(v => v[0] === 'service'), 'sanity: auto.namesuffix must have reached the cache');
    assert.ok(Object.values(full).some(v => v[2] === 'f+ c m+'), 'sanity: auto.memberorder must have reached the cache');

    w('src/svc/ExtraService.java', 'package svc;\n\npublic class ExtraService {\n  public void go() {}\n}\n');
    git('add', '-A'); git('commit', '-qm', 'one more service');
    run();                                          // incremental: the 12 unchanged blobs come back from tree.json
    const incr = snapshot();
    for (const [k, v] of Object.entries(full)) assert.deepEqual(incr[k], v, `${k} changed between the full build and the incremental rebuild`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});
