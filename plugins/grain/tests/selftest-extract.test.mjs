// `grain selftest --extract` (§3.B, .temp/docs/loop-v2.md) — per-grammar declaration RECALL/PRECISION against a
// grammar-derived oracle: every named node type with a `name` field (or `declarator`) and a body-shaped child is
// a declaration candidate, read off the SAME node-types.json bindingFor already parses — no language name, no
// per-language list (`declCandidateTypes`, core.mjs). `extractCoverage` walks the caller-supplied file list,
// parses each file exactly as `parseFile` would for real (the `.h` C/C++ tie-break included), and matches oracle
// candidates against `extractScopes`'s own output at the SAME LINE — a hit is recall's numerator, a scope with no
// matching candidate line is precision's numerator's complement (an "extra": grain recorded something the oracle
// does not consider a declaration).
//
// Three direct unit cases (no git, no CLI process — `extractCoverage` takes a plain file list and a `read`
// function, exactly like `learn()`'s own `tree` parameter):
//   (a) a small, unambiguous fixture where the oracle and extraction agree on every line — recall = precision = 1.
//   (b) a PLANTED miss: a `.h` file whose content is genuine C++ (`namespace demo { void plantedMiss() {…} }`)
//       but ties to the `c` grammar under `parseFile`'s own error-count tie-break (the C misparse of `namespace
//       demo {` is not STRICTLY worse than its real C++ reading for this snippet, so `.h`'s primary grammar, `c`,
//       is kept) — the misparsed `demo` becomes a real oracle candidate (a `function_definition` node, name field
//       "demo") that `extractScopes`'s own declarator-recovery logic (§040, core.mjs) declines to name, a genuine,
//       reproducible miss below 1.0 recall.
//   (c) the no-parse path: a file `read` cannot serve (returns null) is counted in `noParse` and contributes to
//       no grammar's tally — the CLI's own git-tree read can fail the same way for a path listed but not present.
// Plus a CLI-level smoke test on the shared TypeScript fixture (`selftest`'s own builder) for text/`--json` shape
// and the dispatcher wiring (`grain.mjs`'s `case 'selftest'`, `opts.extract`), and `docs-audit.test.mjs` covers
// the documentation side (no new dispatch command was added — `--extract` is a flag on the existing `selftest`).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractCoverage, declCandidateTypes } from '../engine/core.mjs';
import { GRAMMARS } from '../engine/config.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');

// =====================================================================================================
// unit: declCandidateTypes — the oracle's own type set, and its documented boundary
// =====================================================================================================

test('declCandidateTypes: the data grammars (JSON/YAML/TOML/properties) are a boundary — no declaration-shaped node type at all', () => {
  for (const g of ['json', 'yaml', 'toml', 'properties']) if (GRAMMARS.includes(g))
    assert.equal(declCandidateTypes(g).size, 0, `${g} must have zero declaration candidates (bindingFor's own b.data set)`);
});

test('declCandidateTypes: every non-data grammar has at least one candidate type', () => {
  for (const g of GRAMMARS) if (!['json', 'yaml', 'toml', 'properties'].includes(g))
    assert.ok(declCandidateTypes(g).size > 0, `${g} unexpectedly has zero declaration-shaped node types`);
});

test('declCandidateTypes: a namespace/package/mod location node is never a candidate, in any grammar that has one', () => {
  // the same exclusion extraction itself applies (`isLocationNode`, core.mjs) — a location names WHERE code
  // lives, not a unit of code, in the oracle as much as in extraction
  for (const g of GRAMMARS) for (const t of declCandidateTypes(g))
    assert.ok(!/namespace|package/.test(t) && !/(?:^|_)mod(?:_|$)/.test(t), `${g}'s candidate set must exclude location node "${t}"`);
});

// =====================================================================================================
// (a) recall = precision = 1.0: an unambiguous fixture, oracle and extraction fully agree
// =====================================================================================================

test('extractCoverage: a clean, unambiguous fixture scores recall=1 and precision=1 on every real grammar', async () => {
  const files = {
    'a.ts': `export class Widget {\n  render(): void {\n    console.log('x');\n  }\n}\nexport function build(): Widget {\n  return new Widget();\n}\n`,
    'b.c': `struct Point {\n  int x;\n  int y;\n};\nint add(int a, int b) {\n  return a + b;\n}\n`,
  };
  const rels = Object.keys(files);
  const res = await extractCoverage({ root: '/nonexistent', files: rels, read: rel => files[rel] });
  assert.equal(res.noParse, 0);
  assert.equal(res.misses.length, 0, JSON.stringify(res.misses));
  assert.equal(res.extras.length, 0, JSON.stringify(res.extras));
  for (const g of ['typescript', 'c']) {
    assert.equal(res.grammars[g].recall, 1, `${g} recall`);
    assert.equal(res.grammars[g].precision, 1, `${g} precision`);
  }
  assert.equal(res.total.recall, 1);
  assert.equal(res.total.precision, 1);
});

test('extractCoverage: a scopeless (data-grammar) file is reported as a boundary, recall/precision null, never NaN', async () => {
  const res = await extractCoverage({ root: '/nonexistent', files: ['c.json'], read: () => '{"a": 1}\n' });
  assert.equal(res.grammars.json.boundary, true);
  assert.equal(res.grammars.json.candidates, 0);
  assert.equal(res.grammars.json.recall, null);
  assert.equal(res.grammars.json.precision, null);
});

// =====================================================================================================
// (b) a planted miss: recall below 1.0, reproducibly
// =====================================================================================================

test('extractCoverage: a planted C/C++ ambiguity (§040-adjacent) produces a genuine, reproducible miss', async () => {
  // `namespace demo { void plantedMiss() { int x = 1; } }` as a `.h` file: `parseFile`'s own tie-break (config.mjs
  // EXT_ALT) only swaps `.h`'s primary grammar (`c`) for `cpp` when the alternate parses STRICTLY cleaner — for
  // this tiny snippet the `c` parse is not strictly worse, so it stays on `c`, where `namespace` is not a keyword
  // at all. The misparse recovers `demo` as a `function_definition` (a real candidate: `name` field "demo") that
  // extraction's own declarator-recovery logic declines to name (core.mjs, the `recoveredType` block, §040).
  const src = 'namespace demo {\nvoid plantedMiss() {\n  int x = 1;\n}\n}\n';
  const res = await extractCoverage({ root: '/nonexistent', files: ['fixture.h'], read: () => src });
  assert.ok(res.grammars.c, `expected the "c" grammar (got: ${Object.keys(res.grammars)}) — this fixture is pinned to a specific tie-break outcome`);
  assert.ok(res.grammars.c.recall < 1, `expected a real miss, recall was ${res.grammars.c.recall}`);
  assert.ok(res.misses.some(m => m.endsWith(' demo')), `expected a "demo" miss: ${JSON.stringify(res.misses)}`);
});

// =====================================================================================================
// (c) the no-parse path: a file the reader cannot serve is counted, never crashes, never joins a grammar's tally
// =====================================================================================================

test('extractCoverage: an unreadable file is counted in noParse and excluded from every grammar tally', async () => {
  const files = ['unreadable.ts', 'ok.ts'];
  const read = rel => rel === 'unreadable.ts' ? null : 'export function ok(): void {}\n';
  const res = await extractCoverage({ root: '/nonexistent', files, read });
  assert.equal(res.noParse, 1);
  assert.equal(res.files, 2);
  assert.equal(res.grammars.typescript.candidates, 1);
  assert.equal(res.grammars.typescript.scopes, 1);
});

// =====================================================================================================
// CLI: `grain selftest --extract` — text and --json shape, on the shared fixture
// =====================================================================================================

let tmp, repo;
const grain = (args, opts = {}) => { const r = spawnSync('node', [BIN, ...args], { cwd: opts.cwd || repo, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };

before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-selftest-extract-')); repo = join(tmp, 'fixture'); execFileSync('node', [BUILDER, repo], { stdio: 'pipe' }); });
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('CLI: selftest --extract (text) prints one line per grammar plus a total line, ending with the freshness stamp', () => {
  grain(['status']);
  const { out, code } = grain(['selftest', '--extract']);
  assert.equal(code, 0, out);
  const lines = out.split('\n');
  assert.match(lines.at(-1), /^as of [0-9a-f]{7,}(\+dirty)?( \(STALE\))?$/, out);
  assert.ok(lines.some(l => /^total: recall=(n\/a|\d\.\d\d) precision=(n\/a|\d\.\d\d) candidates=\d+ scopes=\d+$/.test(l)), out);
  // the fixture's own package.json makes json a real, present grammar — a boundary, not a score
  assert.ok(lines.some(l => l.startsWith('json: boundary')), out);
  assert.ok(lines.some(l => /^typescript: recall=\d\.\d\d precision=\d\.\d\d candidates=\d+ scopes=\d+$/.test(l)), out);
});

test('CLI: selftest --extract --json is one parseable document with per-grammar numbers, a total, and capped miss/extra samples', () => {
  grain(['status']);
  const a = JSON.parse(grain(['selftest', '--extract', '--json']).out);
  assert.deepEqual(Object.keys(a).sort(), ['asOf', 'extras', 'files', 'grammars', 'misses', 'noParse', 'total'].sort());
  assert.match(a.asOf, /^[0-9a-f]{7,}(\+dirty)?( \(STALE\))?$/, `asOf must carry the freshness stamp's own payload: ${a.asOf}`);
  assert.equal(a.grammars.json.boundary, true);
  assert.ok(a.grammars.typescript.recall > 0 && a.grammars.typescript.recall <= 1);
  assert.ok(a.misses.length <= 10, `misses must be capped at 10, got ${a.misses.length}`);
  assert.ok(a.extras.length <= 10, `extras must be capped at 10, got ${a.extras.length}`);
  for (const m of [...a.misses, ...a.extras]) assert.match(m, /^\S+:\d+ .+$/, `expected "file:line name", got "${m}"`);
});

test('CLI: selftest --extract takes no positional arguments', () => {
  const { code, err } = grain(['selftest', '--extract', 'bogus']);
  assert.notEqual(code, 0);
  assert.match(err, /usage: grain selftest/);
});
