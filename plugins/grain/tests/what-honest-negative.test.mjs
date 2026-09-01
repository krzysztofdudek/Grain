// §018/§011/§014 — the shared defect behind three separate field-test findings: `what` answers "has no
// declarations or values anywhere in this repository's code" in situations where that claim is not true, because
// grain already HAD the evidence to hedge and threw it away.
//   - §011 (df-gated value): a literal exists in exactly one file, so `CFG.valueDfMin=2` correctly excludes it
//     from `model.valueIndex` — but `what` then reports the same bare "nothing" it would for a value that was
//     never in the source at all. Seen-and-gated must read differently from never-seen.
//   - §018/§014 (extraction gap): a file parses cleanly but yields zero real scopes (a macro-only body in Rust,
//     a package-level `const`/`var` block in Go — and, reproduced here without either language, a bare top-level
//     `const` in TypeScript: grain's own binding does not turn it into a scope either). `defined`/`values` for a
//     symbol living only in such a file come back empty in a way indistinguishable from the symbol not existing.
// The fix (core.mjs, `whatCmd`'s empty branch — see `gatedValueNote`/`unseenFilesNote`) makes the empty answer
// name which of the two cases applies, and leaves the case where NEITHER applies exactly as terse as before: a
// competent reader must not conclude "multi-word queries are broken" (§011's own retest damage) from a hedge that
// was never warranted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
// the internal model, for pinning fixture PREMISES only (never a published interface — `grain export`'s schema
// deliberately omits `filesAll`/`valueIndex`, see export.mjs's own comment on why the raw index is not exported)
const modelIn = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
  GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const grainIn = (dir, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const initRepo = prefix => { const tmp = mkdtempSync(join(tmpdir(), prefix)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main'); gitIn(repo, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };
// 15 filler files with real, extractable scopes — same density what-exact-match.test.mjs uses to clear the
// partitioning threshold (a repo this small with NO fillers gets zero partitions and EVERY query, real symbols
// included, reads as "not found" — that is a real, separate model-sizing behavior, not this bug).
const fillers = (dir, n) => { for (let i = 1; i <= n; i++) w(dir, `src/filler${i}.ts`, `export function f${i}(): number { return ${i}; }\n`); };

// ===========================================================================================================
// repo ABSENT — case 1: a query that matches nothing anywhere, on a repo where every single file DOES parse to
// real scopes (no extraction gap to disclose) and no literal anywhere is even close to the query. The honest
// answer here is exactly as terse as it always was — this is the guard against the fix over-hedging.
// ===========================================================================================================
let tmpAbsent, repoAbsent;
test('setup: repo with no extraction gap and no gated value', () => {
  ({ tmp: tmpAbsent, repo: repoAbsent } = initRepo('grain-honest-neg-absent-'));
  fillers(repoAbsent, 15);
  gitIn(repoAbsent, 'add', '-A'); gitIn(repoAbsent, 'commit', '-qm', 'fillers only');
  const st = grainIn(repoAbsent, ['status']); assert.equal(st.code, 0, st.err);
});

test('(1) a genuinely absent symbol gets a short, clean "not found" — not verbose', () => {
  const r = grainIn(repoAbsent, ['what', 'totallyNonexistentSymbolXyz']);
  assert.equal(r.code, 0, r.err);
  const lines = r.out.split('\n');
  assert.match(r.out, /has no declarations or values anywhere in this repository's code/, r.out);
  // NOT verbose: the header, the map claim, and the `as of` stamp — nothing else. No hedge about a gated value or
  // an unseen file was warranted here, so none must appear.
  assert.equal(lines.length, 3, `expected exactly 3 lines (header + claim + stamp), got:\n${r.out}`);
  assert.ok(!r.out.includes('below the'), `must not fabricate a df-floor hedge with no gated value to report:\n${r.out}`);
  assert.ok(!r.out.includes('cannot see'), `must not fabricate an unseen-files hedge with no extraction gap to report:\n${r.out}`);
  assert.ok(!r.out.includes('Seen, not absent'), r.out);

  const j = JSON.parse(grainIn(repoAbsent, ['what', 'totallyNonexistentSymbolXyz', '--json']).out);
  assert.deepEqual(j.defined, []); assert.deepEqual(j.values, []);
});
test('teardown: absent repo', () => { if (tmpAbsent) rmSync(tmpAbsent, { recursive: true, force: true }); });

// ===========================================================================================================
// repo GATED — case 2 (§011): a JSON key that is real, verbatim in the source, appearing in exactly ONE file —
// below CFG.valueDfMin=2, so `model.valueIndex` correctly excludes it. The pre-fix answer is byte-identical to
// case 1's "has no declarations or values anywhere", which is the exact defect §011 reported on express's
// package.json (every key there has df=1 in a single-package repo).
// ===========================================================================================================
let tmpGated, repoGated;
test('setup: repo with a real, single-file (df=1) value', () => {
  ({ tmp: tmpGated, repo: repoGated } = initRepo('grain-honest-neg-gated-'));
  w(repoGated, 'src/config.json', JSON.stringify({ deploymentRegion: 'us-east-1' }));
  fillers(repoGated, 15);
  gitIn(repoGated, 'add', '-A'); gitIn(repoGated, 'commit', '-qm', 'a single-file config value');
  const st = grainIn(repoGated, ['status']); assert.equal(st.code, 0, st.err);
  // confirm the premise directly against the model, the same way §011's own report did
  const m = modelIn(repoGated);
  assert.ok(!Object.keys(m.valueIndex || {}).some(k => k.endsWith(':deploymentRegion')),
    `deploymentRegion must be excluded from valueIndex by the df floor for this test to mean anything: ${JSON.stringify(Object.keys(m.valueIndex || {}))}`);
});

test('(2) a df-gated value is distinguished from case 1 — seen and why it is not indexed, never "does not exist"', () => {
  const r = grainIn(repoGated, ['what', 'deploymentRegion']);
  assert.equal(r.code, 0, r.err);
  // must NOT claim absence — the value provably exists in the source
  assert.ok(!r.out.includes('has no declarations or values anywhere'), `must not claim absence of a value that was seen:\n${r.out}`);
  assert.match(r.out, /deploymentRegion.*seen/i, r.out);
  assert.match(r.out, /1 file/, r.out);
  assert.match(r.out, /src\/config\.json/, r.out);
  assert.match(r.out, /below the 2-file floor/, r.out);
});
test('teardown: gated repo', () => { if (tmpGated) rmSync(tmpGated, { recursive: true, force: true }); });

// ===========================================================================================================
// repo BLIND — case 3 (§018/§014 shape): `src/onlyConsts.ts` parses without error and contributes to
// `model.filesAll`, but its ONLY content is top-level `const` bindings — grain's own binding does not turn
// these into scopes (confirmed directly against a real build: the file is present in `filesAll` and absent from
// every partition's `fileScopes`), the exact shape of axum's macro-only rejection.rs and gin's package-level
// const/var blocks, reproduced here in a grammar that needs no macro support to exhibit it.
// ===========================================================================================================
let tmpBlind, repoBlind;
test('setup: repo with a file that parses to zero real scopes', () => {
  ({ tmp: tmpBlind, repo: repoBlind } = initRepo('grain-honest-neg-blind-'));
  w(repoBlind, 'src/onlyConsts.ts', 'export const ONLY_CONST_VALUE = 42;\nexport const ANOTHER_CONST = "hello";\n');
  fillers(repoBlind, 15);
  gitIn(repoBlind, 'add', '-A'); gitIn(repoBlind, 'commit', '-qm', 'a zero-scope file');
  const st = grainIn(repoBlind, ['status']); assert.equal(st.code, 0, st.err);
  const m = modelIn(repoBlind);
  const seen = new Set(); for (const p of m.partitions || []) for (const rel of Object.keys(p.fileScopes || {})) seen.add(rel);
  assert.ok((m.filesAll || []).includes('src/onlyConsts.ts'), `fixture premise: file must be indexed: ${JSON.stringify(m.filesAll)}`);
  assert.ok(!seen.has('src/onlyConsts.ts'), 'fixture premise: the file must yield zero real scopes for this test to mean anything');
});

test('(3) a symbol living only in a zero-scope file is distinguished from case 1', () => {
  const r = grainIn(repoBlind, ['what', 'ONLY_CONST_VALUE']);
  assert.equal(r.code, 0, r.err);
  // the plain absence claim would overclaim here too (the exact text WAS found, just not confirmed as a
  // declaration) — replaced by a distinct hedge, exactly like the gated-value case
  assert.ok(!r.out.includes('has no declarations or values anywhere'), `must not claim absence of text that was found verbatim:\n${r.out}`);
  assert.match(r.out, /cannot see/, r.out);
  assert.match(r.out, /src\/onlyConsts\.ts/, r.out);
});

test('teardown: blind repo', () => { if (tmpBlind) rmSync(tmpBlind, { recursive: true, force: true }); });

// ===========================================================================================================
// repo REGRESSION — every existing `what` success path (a real symbol, a real multi-place value, its siblings)
// must render byte-identical to pre-fix behavior: none of the three cases above apply, so `whatCmd`'s non-empty
// branches (defined/values/spread/siblings) are untouched code paths, and this pins that down directly rather
// than trusting it by inspection.
// ===========================================================================================================
let tmpReg, repoReg;
test('setup: regression repo — a real declaration and a real df=2 value', () => {
  ({ tmp: tmpReg, repo: repoReg } = initRepo('grain-honest-neg-regress-'));
  w(repoReg, 'src/widget.ts', 'export function widgetHandler(): number { return 1; }\n');
  w(repoReg, 'src/a.json', JSON.stringify({ sharedRegion: 'eu-west-1' }));
  w(repoReg, 'src/b.json', JSON.stringify({ sharedRegion: 'eu-west-1' }));
  fillers(repoReg, 15);
  gitIn(repoReg, 'add', '-A'); gitIn(repoReg, 'commit', '-qm', 'regression fixture');
  const st = grainIn(repoReg, ['status']); assert.equal(st.code, 0, st.err);
});

test('(4a) a real declaration renders exactly as before, plus §065\'s own honest "tested by" negative — no OTHER hedge text leaks into a found answer', () => {
  const r = grainIn(repoReg, ['what', 'widgetHandler']);
  assert.equal(r.code, 0, r.err);
  // §065: a real declaration with no test coverage by any of the three signals now also carries the honest
  // "tested by: no test file identified" negative — header + defined + spread + tested-by + stamp.
  assert.equal(r.out.split('\n').length, 5, `expected header + defined + spread + tested-by + stamp only, got:\n${r.out}`);
  assert.match(r.out, /defined: src\/widget\.ts:1 `widgetHandler` \(method\)/, r.out);
  assert.match(r.out, /^map: tested by: no test file identified for this symbol/m, r.out);
  assert.ok(!r.out.includes('Seen, not absent') && !r.out.includes('cannot see'), r.out);
});

test('(4b) a real df=2 value renders exactly as before — no hedge text leaks into a found answer', () => {
  const r = grainIn(repoReg, ['what', 'sharedRegion']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /values: `sharedRegion` in 2 places \(key\)/, r.out);
  assert.ok(!r.out.includes('Seen, not absent') && !r.out.includes('cannot see') && !r.out.includes('below the'), r.out);
});
test('teardown: regression repo', () => { if (tmpReg) rmSync(tmpReg, { recursive: true, force: true }); });
