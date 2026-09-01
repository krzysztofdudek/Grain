// §037 (+ §039) — every honest-negative disclosure grain shipped fired ONLY on an EMPTY answer, and the field
// showed that is the wrong half of the problem. An empty result already reads as "grain found nothing"; a page of
// unrelated token-overlap hits reads as "grain found your thing" — which is exactly when the caveat is most needed
// and was least present.
//
//   §037, measured on Kotlin/okhttp: `what MAX_CONCURRENT_STREAMS` returned ONE unrelated test method
//   (`settingsLimitsMaxConcurrentStreams`) and no warning, missing the real `const val` — because `Settings.kt`
//   parses to zero scopes on a genuine tree-sitter-kotlin defect (a class carrying both a property and a
//   same-named `operator fun` throws one ERROR node for the whole body). grain HAD the blind-file caveat built for
//   exactly this; a weak, unrelated match suppressed it.
//
// The gate that makes this safe is measured, not guessed. Attaching the caveat whenever any blind file contains
// the query fires on 18.6% of non-empty answers across nine real repos — the same over-hedging §018 already tried
// and the cross-check oracle already rejected. Three conditions together bring that to 1.7%:
//   (1) no exact-name match anywhere in the answer — trustworthy only since §036 computes `exactLocal` over the
//       full set, before the display cap;
//   (2) the query carries >= 2 name tokens — §002's own cut, for §002's own reason: a single token's verbatim
//       appearance in some file is the birthday paradox, not evidence;
//   (3) the blind file is peer-ANOMALOUS (its grammar yields scopes elsewhere here) and the match is at identifier
//       boundaries with exact case.
// §011's clean "not found" is guarded below and must stay exactly as terse as it always was.
//
// §039 rides along because it is the same defect class as §036 one step further: `spread`, `used by: N files` and
// `howCmd`'s archetype cover all read the DISPLAY-CAPPED `defined` list, so each understated a measurement. They
// now read the full set; only the rendering stays capped, and its truncation is stated (`+N more`).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const modelIn = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x',
  GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const grainIn = (dir, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const initRepo = prefix => { const tmp = mkdtempSync(join(tmpdir(), prefix)); const repo = join(tmp, 'r'); mkdirSync(repo);
  gitIn(repo, 'init', '-q', '-b', 'main'); gitIn(repo, 'config', 'commit.gpgsign', 'false'); return { tmp, repo }; };
const fillers = (dir, n) => { for (let i = 1; i <= n; i++) w(dir, `src/filler${i}.ts`, `export function f${i}(): number { return ${i}; }\n`); };

// ===========================================================================================================
// The okhttp shape, reproduced without needing the Kotlin grammar's own defect: `src/settings.ts` holds ONLY
// top-level `const` bindings, which grain's binding does not turn into scopes — the same zero-scope outcome
// §018's own fixture already relies on. `MAX_CONCURRENT_STREAMS` is declared there and NOWHERE else as a real
// scope; meanwhile a test file declares `settingsLimitsMaxConcurrentStreams`, which shares all three of the
// query's tokens and so is a legitimate `coversQt` hit — the weak answer that used to suppress the caveat.
// ===========================================================================================================
let tmp, repo;
before(() => {
  ({ tmp, repo } = initRepo('grain-what-weak-'));
  w(repo, 'src/settings.ts', [
    'export const MAX_CONCURRENT_STREAMS = 4;',
    'export const HEADER_TABLE_SIZE = 1;',
    'export const DEFAULT_WINDOW = MAX_CONCURRENT_STREAMS * HEADER_TABLE_SIZE;',
    ''].join('\n'));
  // the weak, unrelated match: covers max/concurrent/streams, is not the name
  w(repo, 'src/http2.test.ts', 'export function settingsLimitsMaxConcurrentStreams(): number { return 7; }\n');
  // a peer-NORMAL blind file: a data format that yields no scopes anywhere here, so its own blindness is not
  // evidence of anything. It carries a distinctive compound name that must NOT earn the caveat.
  w(repo, 'config/deploy.json', JSON.stringify({ rolloutBatchSize: 3 }, null, 2) + '\n');
  w(repo, 'src/rollout.ts', 'export function rolloutBatchSizeLimit(): number { return 3; }\n');
  fillers(repo, 15);
  gitIn(repo, 'add', '-A'); gitIn(repo, 'commit', '-qm', 'the weak-answer fixture');
  const st = grainIn(repo, ['status']); assert.equal(st.code, 0, st.err);
  // fixture premises, pinned directly against the model the same way §018's own test does
  const m = modelIn(repo);
  const seen = new Set(); for (const p of m.partitions || []) for (const rel of Object.keys(p.fileScopes || {})) seen.add(rel);
  assert.ok((m.filesAll || []).includes('src/settings.ts'), 'premise: the const file must be indexed');
  assert.ok(!seen.has('src/settings.ts'), 'premise: the const file must yield zero scopes');
  assert.ok(!seen.has('config/deploy.json'), 'premise: the json file must yield zero scopes too');
  assert.ok([...seen].some(f => f.endsWith('.ts')), 'premise: other .ts files DO yield scopes — that is what makes src/settings.ts anomalous');
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('(1) §037: a weak, non-empty answer that names nothing carries the blind-file caveat', () => {
  const r = grainIn(repo, ['what', 'MAX_CONCURRENT_STREAMS']);
  assert.equal(r.code, 0, r.err);
  // the weak match is still returned — this fix changes the disclosure, not the matching
  assert.match(r.out, /settingsLimitsMaxConcurrentStreams/, r.out);
  // ...and is no longer presented as though it were the answer
  assert.match(r.out, /nothing above IS «MAX_CONCURRENT_STREAMS»/, r.out);
  assert.match(r.out, /src\/settings\.ts/, r.out);
  assert.match(r.out, /cannot see inside it/, r.out);
});

test('(2) the caveat is machine-readable, distinguishable from the empty-answer blind note', () => {
  const j = JSON.parse(grainIn(repo, ['what', 'MAX_CONCURRENT_STREAMS', '--json']).out);
  assert.equal(j.note?.kind, 'blind-weak', JSON.stringify(j.note));
  assert.equal(j.note.file, 'src/settings.ts');
  assert.ok(j.defined.length > 0, 'the answer really is non-empty — that is the whole point');
});

test('(3) an exact-name match suppresses the caveat — grain found the thing, nothing is missing', () => {
  // `rolloutBatchSizeLimit` is declared for real; `rolloutBatchSize` (its own name minus a token) is not, but a
  // query for the DECLARED name must never hedge
  const r = grainIn(repo, ['what', 'rolloutBatchSizeLimit']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /defined:.*rolloutBatchSizeLimit/, r.out);
  assert.ok(!r.out.includes('cannot see inside it'), `an exact hit must not hedge:\n${r.out}`);
  assert.ok(!r.out.includes('nothing above IS'), r.out);
});

test('(4) a peer-NORMAL blind file earns no caveat — a data file yielding nothing is not an anomaly', () => {
  // `rolloutBatchSize` has no exact declaration, has >= 2 tokens, and appears verbatim in config/deploy.json —
  // every condition but peer-anomaly. No .json file anywhere here yields scopes, so its blindness discloses
  // nothing, and the loose "any blind file contains the text" rule this fix rejected would have fired.
  const r = grainIn(repo, ['what', 'rolloutBatchSize']);
  assert.equal(r.code, 0, r.err);
  assert.ok(!r.out.includes('cannot see inside it'), `a data file's blindness is not evidence:\n${r.out}`);
  const j = JSON.parse(grainIn(repo, ['what', 'rolloutBatchSize', '--json']).out);
  assert.equal(j.note, null, JSON.stringify(j.note));
});

test('(5) a single-token query never earns the caveat — one token is the birthday paradox, not evidence', () => {
  // `WINDOW` tokenizes to one token, has no exact declaration, and appears verbatim inside the anomalous blind
  // file (`DEFAULT_WINDOW`). Firing here is the 18.6% over-hedging this fix exists to avoid.
  const r = grainIn(repo, ['what', 'window']);
  assert.equal(r.code, 0, r.err);
  assert.ok(!r.out.includes('cannot see inside it'), `single-token queries must not hedge:\n${r.out}`);
});

// ===========================================================================================================
// §011's guard, restated here so this fix owns it too: the three answers that must be UNCHANGED. The naive
// version of §037 (attach whenever any blind file exists) makes a genuinely-absent query and a real one read
// identically on any repo with a single blind file — nearly always — which is what the cross-check oracle caught
// during §018 and what these three pin down.
// ===========================================================================================================
test('(6) §011 unchanged: a genuinely absent symbol still gets the short, clean "not found"', () => {
  const r = grainIn(repo, ['what', 'totallyNonexistentSymbolXyz']);
  assert.equal(r.code, 0, r.err);
  const lines = r.out.split('\n');
  assert.match(r.out, /has no declarations or values anywhere in this repository's code/, r.out);
  assert.equal(lines.length, 3, `header + claim + stamp only, got:\n${r.out}`);
  assert.ok(!r.out.includes('nothing above IS'), r.out);
});

test('(7) §018 unchanged: the EMPTY-answer blind note still fires, on its own looser scan', () => {
  // `HEADER_TABLE_SIZE` lives only in the blind file and matches no other declaration at all — the empty path,
  // which deliberately keeps §018's substring scan: an answer already saying "nothing found" cannot be made
  // overconfident by a hedge.
  const j = JSON.parse(grainIn(repo, ['what', 'HEADER_TABLE_SIZE', '--json']).out);
  assert.equal(j.note?.kind, 'blind', JSON.stringify(j.note));
  assert.deepEqual(j.defined, []);
});

// ===========================================================================================================
// §039 — the display cap must decide nothing but what is displayed.
// ===========================================================================================================
let tmp2, repo2;
test('setup: a symbol with far more than the cap of declaration hits', () => {
  ({ tmp: tmp2, repo: repo2 } = initRepo('grain-what-cap-'));
  // 30 files, each declaring a distinct name covering both query tokens, so all 30 are `coversQt` hits. The
  // suffix is alphabetic on purpose: `tokenize` only splits camelCase at a lower→upper boundary, so a trailing
  // digit would fuse into the previous token (`PaymentHandler01` → `payment`/`handler01`) and cover nothing.
  const sfx = i => 'Q' + String.fromCharCode(97 + Math.floor((i - 1) / 26)) + String.fromCharCode(97 + ((i - 1) % 26));
  // three modules of ten, not thirty of one: `spread` renders at most 5 modules, so a one-file-per-module layout
  // could never show a total above the cap even with the fix in place
  const mod = i => ['alpha', 'beta', 'gamma'][Math.floor((i - 1) / 10)];
  for (let i = 1; i <= 30; i++) w(repo2, `src/${mod(i)}/h${String(i).padStart(2, '0')}.ts`,
    `export class PaymentHandler${sfx(i)} { run(): number { return ${i}; } }\n`);
  // importers, so file-level fan-in edges exist into the hit files
  for (let i = 1; i <= 30; i++) w(repo2, `src/use/use${String(i).padStart(2, '0')}.ts`,
    `import { PaymentHandler${sfx(i)} } from '../${mod(i)}/h${String(i).padStart(2, '0')}';\nexport function u${i}(): number { return new PaymentHandler${sfx(i)}().run(); }\n`);
  fillers(repo2, 15);
  gitIn(repo2, 'add', '-A'); gitIn(repo2, 'commit', '-qm', 'the display-cap fixture');
  const st = grainIn(repo2, ['status']); assert.equal(st.code, 0, st.err);
});

test('(8) the rendered list stays capped at 12 and SAYS it is truncated', () => {
  const r = grainIn(repo2, ['what', 'payment handler']);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(grainIn(repo2, ['what', 'payment handler', '--json']).out);
  assert.equal(j.defined.length, 12, `the display cap is unchanged: ${j.defined.length}`);
  assert.match(r.out, /\+\d+ more/, `the truncation must be stated, not swallowed:\n${r.out}`);
});

test('(9) `spread` counts every hit file, not just the twelve shown', () => {
  const j = JSON.parse(grainIn(repo2, ['what', 'payment handler', '--json']).out);
  const total = j.spread.reduce((a, s) => a + s.n, 0);
  // 30 distinct declaration files exist; the capped list can only ever see 12 of them
  assert.ok(total > 12, `spread must be computed over the full set, got ${total} across ${JSON.stringify(j.spread)}`);
});

test('(10) `used by: N files` counts fan-in into the true top declaration files', () => {
  const j = JSON.parse(grainIn(repo2, ['what', 'payment handler', '--json']).out);
  assert.ok(j.usedBy.files > 0, `fan-in must be reported: ${JSON.stringify(j.usedBy)}`);
  // the ranking that picks the top-3 files now runs over all 30 hits; under the cap it could only ever consider
  // the 12 that survived an alphabetical sort
  const r = grainIn(repo2, ['what', 'payment handler']);
  assert.match(r.out, /used by: \d+ files/, r.out);
});

test('teardown: display-cap repo', () => { if (tmp2) rmSync(tmp2, { recursive: true, force: true }); });
