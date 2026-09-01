// J2.4 — the language bridge earns its place by a real acceptance test, not a raw count.
//
// Before this ticket the bridge admitted a (token, file) pair on `n >= 2`: the token and the file co-occurred in at
// least two commits. That filter has no denominator and never asks how often the file is touched ANYWAY, so a file
// that changes in most commits passes it for any token that happens to sit beside it twice — the token translates
// nothing, it just rides the file's own base rate.
//
// The replacement is the MDL/KT shape the rest of this codebase decides by (mine(), architectureNorms()): a
// two-value cell (touched : not) over the `df` commits that SAY the token, scored as the codelength saved by coding
// those outcomes at the KT-smoothed token-conditional rate instead of at the file's own unconditional base rate
// `baza = fileCommits[f] / commitsN`. A bridge must earn positive bits, must point in the EXCESS-touching
// direction, and must clear the same posterior-predictive λ bound every other decision here clears.
//
// THE FIXTURE IS BUILT TO BE HAND-COMPUTABLE, NOT REALISTIC. 30 commits:
//   C1        create src/hot.ts + src/other/a.ts        "base tree"
//   C2..C21   src/hot.ts alone            (20 commits)  "tweak hot path"
//   C22..C24  src/hot.ts alone             (3 commits)  "payment retry hot path"
//   C25       src/other/a.ts alone                      "payment audit trail"
//   C26..C30  src/rare/levy.ts alone     (5 commits)  "refund batch levy"
// so that, exactly:
//   commitsN = 30
//   fileCommits['src/hot.ts']         = 1 + 20 + 3 = 24  → baza = 24/30 = 0.8   (the 80% file)
//   fileCommits['src/rare/levy.ts'] = 5                → baza =  5/30 = 1/6   (the rare file)
//   fileCommits['src/other/a.ts']     = 1 + 1 = 2        → baza =  2/30 = 1/15
//   «payment» df = 4, k(payment, src/hot.ts)         = 3   ← case (a), the counter-example
//   «refund» df = 5, k(refund, src/rare/levy.ts) = 5   ← case (b), the genuine bridge
// Neither word appears anywhere in the code, which is what makes them bridge candidates at all (`where` consults
// the bridge only for query words no code card carries). Every message is drawn from a deliberately tiny
// vocabulary so the shared index universe stays small and hand-countable — see test (e).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

let tmp, repo, repoB, repoD;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const git = (...a) => gitIn(repo, ...a);
const grainIn = (dir, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const grain = (args) => grainIn(repo, args);
const wIn = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const w = (rel, content) => wIn(repo, rel, content);

const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
let day = 0;
const commitIn = (dir, msg) => { day += 2; const d = new Date(T0 + day * 86400000).toISOString();
  gitIn(dir, 'add', '-A');
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg], { encoding: 'utf8', env: { ...process.env, ...gitEnv, GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d } }); };
const commit = msg => commitIn(repo, msg);

const modelIn = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));
const loadModel = () => modelIn(repo);
const rowIn = (dir, t) => (modelIn(dir).msgAffinity || []).find(r => r.t === t) || null;
const rowFor = t => rowIn(repo, t);

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-bridge-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');

  w('src/hot.ts', 'export class Hot { run() { return 0; } }\n');
  w('src/other/a.ts', 'export const a = () => 0;\n');
  commit('base tree');                                                     // C1

  for (let i = 1; i <= 20; i++) {                                          // C2..C21
    w('src/hot.ts', `export class Hot { run() { return ${i}; } }\n`);
    commit('tweak hot path'); }

  for (let i = 21; i <= 23; i++) {                                         // C22..C24
    w('src/hot.ts', `export class Hot { run() { return ${i}; } }\n`);
    commit('payment retry hot path'); }

  w('src/other/a.ts', 'export const a = () => 1;\n');                      // C25
  commit('payment audit trail');

  for (let i = 1; i <= 5; i++) {                                           // C26..C30
    w('src/rare/levy.ts', `export const levy = () => ${i};\n`);
    commit('refund batch levy'); }

  const st = grain(['status']); assert.equal(st.code, 0, st.err);

  // ---- repoB (§J2.4b): the DENOMINATOR fixture. 40 commits, of which only 20 are non-mass. ----
  //   B1        create src/f.ts + src/other.ts             "base tree"
  //   B2..B9    src/f.ts alone               (8 commits)   "levy posted batch"
  //   B10..B16  src/f.ts alone               (7 commits)   "adjust core logic"
  //   B17..B20  src/other.ts alone           (4 commits)   "touch other side"
  //   B21..B40  bulk/b00..b34, 35 files at a time (20)     "bulk sweep N"
  // The bulk commits exceed CFG.megaCap = 30, so they contribute to NOTHING the bridge reads — not msgAff, not
  // msgTokCommits, not fileCommits — yet `commitsN` counts them all the same. That mismatch IS the bug:
  //   nonMegaCommits = 20   commitsN = 40   fileCommits['src/f.ts'] = 1 + 8 + 7 = 16
  //   true  baza = 16/20 = 0.8     ← the rate over the population the counts actually came from
  //   buggy baza = 16/40 = 0.4     ← deflated by exactly the mass-commit share
  repoB = join(tmp, 'b'); mkdirSync(repoB);
  gitIn(repoB, 'init', '-q', '-b', 'main'); gitIn(repoB, 'config', 'commit.gpgsign', 'false');
  wIn(repoB, 'src/f.ts', 'export const f = () => 0;\n');
  wIn(repoB, 'src/other.ts', 'export const o = () => 0;\n');
  commitIn(repoB, 'base tree');
  for (let i = 1; i <= 8; i++) { wIn(repoB, 'src/f.ts', `export const f = () => ${i};\n`); commitIn(repoB, 'levy posted batch'); }
  for (let i = 9; i <= 15; i++) { wIn(repoB, 'src/f.ts', `export const f = () => ${i};\n`); commitIn(repoB, 'adjust core logic'); }
  for (let i = 1; i <= 4; i++) { wIn(repoB, 'src/other.ts', `export const o = () => ${i};\n`); commitIn(repoB, 'touch other side'); }
  for (let m = 1; m <= 20; m++) {
    for (let j = 0; j < 35; j++) wIn(repoB, `bulk/b${j}.ts`, `export const b${j} = () => ${m};\n`);
    commitIn(repoB, `bulk sweep ${m}`); }
  const stB = grainIn(repoB, ['status']); assert.equal(stB.code, 0, stB.err);

  // ---- repoD (§J2.4b): the fixture where n-order and bits-order DISAGREE. 40 commits, none of them mass. ----
  //   D1        create src/pad.ts                          "base setup"
  //   D2..D15   src/hi.ts + src/lo.ts       (14 commits)   "probe signal"
  //   D16       src/hi.ts alone                            "probe signal"
  //   D17..D21  src/hi.ts alone              (5 commits)   "rev adjust code"
  //   D22..D26  src/pad.ts alone             (5 commits)   "rev pad noise"
  //   D27..D40  src/pad.ts alone            (14 commits)   "pad noise"
  // giving fileCommits hi = 20, lo = 14, pad = 20 over 40 commits, and «signal» df = 15 with k(hi) = 15, k(lo) = 14.
  repoD = join(tmp, 'd'); mkdirSync(repoD);
  gitIn(repoD, 'init', '-q', '-b', 'main'); gitIn(repoD, 'config', 'commit.gpgsign', 'false');
  wIn(repoD, 'src/pad.ts', 'export const pad = () => 0;\n');
  commitIn(repoD, 'base setup');
  for (let i = 1; i <= 14; i++) {
    wIn(repoD, 'src/hi.ts', `export const hi = () => ${i};\n`);
    wIn(repoD, 'src/lo.ts', `export const lo = () => ${i};\n`);
    commitIn(repoD, 'probe signal'); }
  wIn(repoD, 'src/hi.ts', 'export const hi = () => 15;\n'); commitIn(repoD, 'probe signal');
  for (let i = 16; i <= 20; i++) { wIn(repoD, 'src/hi.ts', `export const hi = () => ${i};\n`); commitIn(repoD, 'rev adjust code'); }
  for (let i = 1; i <= 5; i++) { wIn(repoD, 'src/pad.ts', `export const pad = () => ${i};\n`); commitIn(repoD, 'rev pad noise'); }
  for (let i = 6; i <= 19; i++) { wIn(repoD, 'src/pad.ts', `export const pad = () => ${i};\n`); commitIn(repoD, 'pad noise'); }
  const stD = grainIn(repoD, ['status']); assert.equal(stD.code, 0, stD.err);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

// ----- the ledger the tests below assert against, recomputed here so a fixture drift fails loudly and early -----
test('the fixture carries exactly the counts every other test in this file hand-computes from', () => {
  const m = loadModel();
  assert.equal(m.historyStats.commits, 30, 'commitsN');
  // `where` never prints fileCommits, so assert the two base rates through the bits they produce (tests b/c);
  // here just pin the shape the acceptance test consumes.
  const pay = rowFor('payment'), dun = rowFor('refund');
  assert.ok(dun, '«refund» must survive as a bridge row');
  assert.deepEqual(dun.files.map(([f]) => f), ['src/rare/levy.ts'], '«refund» touches exactly the rare file');
  assert.equal(dun.files[0][1], 5, 'k(refund, levy) = 5');
  assert.equal(pay, null, '«payment» must not survive as a bridge row at all');
});

// (a) THE COUNTER-EXAMPLE. `src/hot.ts` is touched in 24 of 30 commits — baza = 0.8. «payment» appears in 4
// commits and 3 of them touch it, so the observed rate k/df = 3/4 = 0.75 is BELOW the base rate: knowing the
// commit says "payment" makes the file LESS likely to be touched than knowing nothing at all. The old `n >= 2`
// filter passed it (n = 3) and printed a bridge. The acceptance test rejects it three times over:
//   counts = { touched: 3, not: 1 }, df = 4, K = 2
//   pTouchedKT = (3 + 0.5) / (4 + 1) = 0.7        pNotKT = (1 + 0.5) / (4 + 1) = 0.3
//   data = 3·log2(0.7/0.8) + 1·log2(0.3/0.2)
//        = 3·(-0.19264508) + 0.58496250 = -0.57793523 + 0.58496250 = 0.00702727
//   penalty  = 0.5·(2-1)·log2(max(4,2)) = 1
//   idxCost  = 4   (15 distinct (token,file) pairs repo-wide → ceil(log2 15) = 4; see test (e))
//   bits = 0.00702727 - 1 - 4 = -4.99297273        → bits > 0 FAILS
//   direction: k/df = 0.75 > baza = 0.8            → FAILS (a bridge is excess touching, never a deficit)
//   λ bound:   (3+0.5)/(4+1) = 0.7 >= 1 - 1/8 = 0.875 → FAILS
test('(a) a token riding an 80%-of-commits file at BELOW its base rate draws no bridge', () => {
  const r = grain(['where', 'payment']);
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /«payment» appears in no code card here/,
    'the old n>=2 filter printed a bridge for a token that predicts the file WORSE than its own base rate');
  assert.equal(rowFor('payment'), null, '«payment» leaves no msgAffinity row behind either');
});

// (b) THE GENUINE BRIDGE. `src/rare/levy.ts` is touched in 5 of 30 commits — baza = 1/6. «refund» appears in 5
// commits and hits the file in all 5, far above baseline:
//   counts = { touched: 5, not: 0 }, df = 5, K = 2
//   pTouchedKT = (5 + 0.5) / (5 + 1) = 0.91666667   (the `not` term is 0·log2(…) and drops out)
//   data = 5·log2(0.91666667 / 0.16666667) = 5·log2(5.5) = 5·2.45943162 = 12.29715809
//   penalty = 0.5·(2-1)·log2(max(5,2)) = 0.5·2.32192809 = 1.16096405
//   idxCost = 4
//   bits = 12.29715809 - 1.16096405 - 4 = 7.13619404
//   direction: k/df = 1.0 > baza = 0.16666667       → holds
//   λ bound:   (5+0.5)/(5+1) = 0.91666667 >= 0.875  → holds
const BITS_B = 5 * Math.log2((5 + 0.5) / (5 + 2 / 2) / (5 / 30)) - 0.5 * (2 - 1) * Math.log2(Math.max(5, 2)) - 4;
test('(b) a token that hits a rare file in 5 of its own 5 commits is a bridge, and carries its evidence in bits', () => {
  assert.ok(Math.abs(BITS_B - 7.13619404) < 1e-8, 'the hand-computed value and the formula agree: ' + BITS_B);
  const r = grain(['where', 'refund']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /«refund» appears in no code card here, but commits saying it touched: `src\/rare\/levy\.ts` \(5\)/);
  const row = rowFor('refund');
  const [f, n, bits] = row.files[0];
  assert.equal(f, 'src/rare/levy.ts');
  assert.equal(n, 5);
  assert.ok(Math.abs(bits - 7.13619404) < 1e-8, `bits = ${bits}, expected 7.13619404`);
});

// (c) the bridge's shape is unchanged for every consumer: `files` entries still read as [file, count] pairs, with
// `bits` appended as a third element that older destructuring simply ignores.
test('(c) msgAffinity rows keep their published shape — [file, count] with bits appended', () => {
  const row = rowFor('refund');
  assert.deepEqual(Object.keys(row).sort(), ['ex', 'files', 't']);
  assert.equal(row.t, 'refund');
  assert.ok(Array.isArray(row.ex) && row.ex.length === 2, 'the example commit survives');
  for (const e of row.files) { assert.equal(e.length, 3); assert.equal(typeof e[0], 'string');
    assert.equal(typeof e[1], 'number'); assert.equal(typeof e[2], 'number'); }
});

// (d) §J2.4b: there is no df pre-filter any more, and df is NOT what disqualifies a filler word. All three tokens
// below are said in 20-23 of the 30 commits — far over the `max(8, 15%)` threshold the old `filler()` used — and all
// three touch the SAME file at the SAME base rate (0.8). What separates them is evidence, nothing else:
//   «tweak» k=20 df=20 → data = 20·log2(0.97619/0.8) = 5.744, penalty 0.5·log2(20) = 2.161, idxCost 4 → bits −0.4177
//   «hot»/«path» k=23 df=23 → data = 23·log2(0.97917/0.8) = 6.706, penalty 2.262, idxCost 4 → bits +0.4440
// Three more observations of the same rate is what carries «hot» over the line. Under the old rule all three were
// thrown away for being common; under the acceptance test the weak one is refused ON ITS EVIDENCE and the strong
// ones are kept — which is the whole point of §J2.4b.
test('(d) a common token is judged on evidence, not on df — the weak one refused, the strong one kept', () => {
  const m = loadModel();
  const bitsOf = t => { const r = (m.msgAffinity || []).find(x => x.t === t); return r ? r.files.find(([f]) => f === 'src/hot.ts')[2] : null; };
  assert.equal(bitsOf('tweak'), null, '«tweak» earns −0.42 bits over the base rate and is refused');
  for (const t of ['hot', 'path']) {
    const b = bitsOf(t);
    assert.ok(b !== null && Math.abs(b - 0.4440) < 1e-3, `«${t}» bits = ${b}, expected ≈ +0.4440`); }
});

// (e) the index universe is shared by every cell and counted once repo-wide, exactly as architectureNorms counts
// `pairs.size`: it is the number of distinct (token, file) pairs in the raw affinity data BEFORE any filtering —
// filler tokens included, since the index has to be able to name any of them. On this fixture:
//   base, tree      × {src/hot.ts, src/other/a.ts}  = 4
//   tweak, hot, path × {src/hot.ts}                 = 3
//   payment, retry  × {src/hot.ts}                  = 2
//   payment, audit, trail × {src/other/a.ts}        = 3
//   refund, batch, levy × {src/rare/levy.ts}  = 3
//                                              total = 15 → idxCost = ceil(log2 15) = 4
test('(e) the shared index cost is set by the whole candidate universe, not by the surviving rows', () => {
  assert.equal(Math.ceil(Math.log2(Math.max(15, 2))), 4);
  // if the universe drifted, (b)'s bits would move by whole bits and its assertion would fail first — this test
  // exists to name WHY that number is 4, so a fixture edit is diagnosed rather than merely observed.
});

// ===== §J2.4b — no df pre-filter, and a base rate drawn from the population it actually came from =====

// (f) THE DENOMINATOR. «levy» says the word in 8 commits and every one of them touches `src/f.ts`, which is itself
// touched in 16 of the repo's 20 NON-MASS commits. Over the population the counts come from, the token adds almost
// nothing: 1.0 against a base rate of 0.8. Divide by `commitsN` (40) instead and the base rate reads 0.4, so the
// same 8 observations appear to double the file's odds — pure fiction, manufactured by the population mismatch:
//   pTouchedKT = (8 + 0.5) / (8 + 1) = 0.94444444        penalty = 0.5·log2(8) = 1.5      idxCost = 4
//   FIXED  baza = 16/20 = 0.8 → data = 8·log2(0.94444444/0.8) = 1.91572 → bits = 1.91572 - 1.5 - 4 = -3.58428
//   BUGGY  baza = 16/40 = 0.4 → data = 8·log2(0.94444444/0.4) = 9.91572 → bits = 9.91572 - 1.5 - 4 = +4.41572
// The gap is exactly df·log2(commitsN/nonMegaCommits) = 8·log2(2) = 8 bits of invented evidence. Neither the λ
// bound (0.944) nor the direction test (1.0 > either base rate) can catch it — they are blind to the denominator,
// so `bits` is the ONLY thing standing between this repo and a false bridge.
const BITS_LEVY_FIXED = 8 * Math.log2(((8 + 0.5) / (8 + 2 / 2)) / (16 / 20)) - 0.5 * Math.log2(8) - 4;
const BITS_LEVY_BUGGY = 8 * Math.log2(((8 + 0.5) / (8 + 2 / 2)) / (16 / 40)) - 0.5 * Math.log2(8) - 4;
test('(f) a base rate is drawn from the commits its counts came from, not from every commit in the repo', () => {
  assert.ok(Math.abs(BITS_LEVY_FIXED - -3.58428) < 1e-4, `fixed ${BITS_LEVY_FIXED}`);
  assert.ok(Math.abs(BITS_LEVY_BUGGY - +4.41572) < 1e-4, `buggy ${BITS_LEVY_BUGGY}`);
  assert.ok(BITS_LEVY_BUGGY - BITS_LEVY_FIXED - 8 < 1e-9, 'the whole gap is df·log2(commitsN/nonMegaCommits)');

  const m = modelIn(repoB);
  assert.equal(m.historyStats.commits, 40, 'commitsN counts the mass commits too');
  assert.equal(rowIn(repoB, 'levy'), null,
    '«levy» adds 1.0-vs-0.8 over the non-mass commits — a bridge here means the base rate was divided by commitsN');
  const r = grainIn(repoB, ['where', 'levy']);
  assert.equal(r.code, 0, r.err);
  assert.doesNotMatch(r.out, /«levy» appears in no code card here/);
  // «adjust» rides the same file on the same deflated denominator (k=7, df=7) and must fall the same way
  assert.equal(rowIn(repoB, 'adjust'), null, '«adjust» is the same false bridge one observation smaller');
});

// (g) NO df PRE-FILTER. «signal» is said in 15 of repoD's 40 commits — comfortably over the max(8, 15%) = 8 that the
// old `filler()` used to demote on — and it is a genuine bridge: it hits `src/hi.ts` in all 15 and `src/lo.ts` in 14,
// against base rates of 20/40 and 14/40. Under the old rule the whole row was discarded for being common.
//   hi: k=15 df=15 baza=0.5  → data = 15·log2(0.96875/0.5) = 14.31298 → bits = 14.31298 - 1.95345 - 4 = +8.35950
//   lo: k=14 df=15 baza=0.35 → data = 14·log2(0.90625/0.35) + 1·log2(0.09375/0.65) = 16.42227 → bits = +10.46883
const PT = k => (k + 0.5) / (15 + 2 / 2), PEN = 0.5 * Math.log2(15) + 4;   // df = 15 for «signal», idxCost = 4
const BITS_HI = 15 * Math.log2(PT(15) / (20 / 40)) - PEN;
const BITS_LO = 14 * Math.log2(PT(14) / (14 / 40)) + 1 * Math.log2((1 - PT(14)) / (1 - 14 / 40)) - PEN;
test('(g) a token said in many commits is not demoted for it — high df is more evidence, not less', () => {
  assert.ok(Math.abs(BITS_HI - 8.35950) < 1e-4 && Math.abs(BITS_LO - 10.46883) < 1e-4,
    `the hand-computed values and the formula agree: hi ${BITS_HI}, lo ${BITS_LO}`);
  const row = rowIn(repoD, 'signal');
  assert.ok(row, '«signal» (df=15, over the old max(8, 15%) cut) must survive on its evidence');
  const byFile = Object.fromEntries(row.files.map(([f, n, b]) => [f, { n, b }]));
  assert.ok(Math.abs(byFile['src/hi.ts'].b - BITS_HI) < 1e-9, `hi bits ${byFile['src/hi.ts'].b}`);
  assert.ok(Math.abs(byFile['src/lo.ts'].b - BITS_LO) < 1e-9, `lo bits ${byFile['src/lo.ts'].b}`);
});

// (h) A GENUINELY UNINFORMATIVE token is refused by the acceptance test itself, with no help from a df rule.
// «rev» is said in 10 of the 40 commits — 5 touching `src/hi.ts`, 5 touching `src/pad.ts`. Both files are touched in
// 20 of 40 commits, so k/df = 0.5 is EXACTLY each file's base rate: the word predicts nothing. The direction test
// (k/df > baza) refuses it before any codelength is computed, and the λ bound (0.5 < 0.875) would refuse it anyway.
test('(h) a token that merely tracks the base rate is refused on its own evidence, not by a df rule', () => {
  assert.equal(rowIn(repoD, 'rev'), null, '«rev» sits exactly at both files\' base rates and translates nothing');
});

// (i) THE TOP-6 PER TOKEN IS RANKED BY EVIDENCE, NOT BY RAW COUNT. This is the one fixture where the two orders
// disagree: «signal» touches `src/hi.ts` more often (n=15 vs 14) but `src/lo.ts` more informatively (+10.47 bits vs
// +8.36), because `lo` is the rarer file and so the harder one to predict. Sorting by `n` would lead with the
// file the reader could have guessed from the base rate alone.
test('(i) files under a token are ordered by bits, so the strongest evidence is cited first', () => {
  const row = rowIn(repoD, 'signal');
  assert.deepEqual(row.files.map(([f]) => f), ['src/lo.ts', 'src/hi.ts'], 'bits order, not n order');
  assert.equal(row.files[0][1], 14, 'the leader is the file with the SMALLER raw count');
  assert.equal(row.files[1][1], 15);
  assert.ok(row.files[0][2] > row.files[1][2], 'and the larger bits');
  // `where` cites in that same order — the top-3 slice it prints is a slice of this list
  const r = grainIn(repoD, ['where', 'signal']);
  assert.match(r.out, /commits saying it touched: `src\/lo\.ts` \(14\) · `src\/hi\.ts` \(15\)/);
});
