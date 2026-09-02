// Ticket 073's instrument — `grain selftest --obligation`: leave-one-out prediction of the birth-obligation
// table, the same automatically-derived ground truth `selftest --how`/`selftest --where` already run (a past
// commit that ADDED a file IS a recorded obligation; nobody labels anything). This file guards the ONE property
// that makes the harness trustworthy: the candidate's own commit must never be part of the table that scores it
// (the prospective analogue of `leakSubtractedH`'s discipline, §069) — mirrored here the same way
// tests/where-eval-leak-subtraction.test.mjs guards `whereEval`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const grain = (args, cwd) => { const r = spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };

const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
function commitAt(dir, msg, day) {
  const d = new Date(T0 + day * 86400000).toISOString();
  gitIn(dir, 'add', '-A');
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg], { encoding: 'utf8', env: { ...process.env, ...gitEnv, GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d } });
}
function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
}

let tmp;
before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-obligation-selftest-')); });
after(() => rmSync(tmp, { recursive: true, force: true }));

// ===== test 6: selftest --obligation hides the candidate's own commit =====
// Order: scaffold, 4 "clean" births (all touching special.txt), 10 noise commits, then ONE FINAL birth — the
// candidate, and the LAST commit in the whole history. The full model (all 5 births) certifies "5 of 5" — see the
// arithmetic below. But scored PROSPECTIVELY, the table available at the moment the candidate is evaluated must
// contain only the 4 EARLIER births (n=4), which sits below CFG.minRaw (5) and can certify nothing at all. If the
// harness ever let the candidate's own commit count toward its own class total, this event would "predict itself"
// (silently promoted past the support floor by the very commit being scored) instead of correctly scoring silent.
//
//   full model: n=5, k(special.txt)=5, gp=5, N=16 (1 scaffold + 4 + 10 noise + 1 final = 16)
//   data = 5·log2((5.5/6)/(5.5/17)) = 5·log2(2.833) ≈ 7.51 bits; universe={special.txt} ⇒ idxCost=1
//   bits ≈ 7.51 − 0.5·log2(5) − 1 ≈ 5.35 > 0; display bound (5+0.5)/(5+1)=0.917 ≥ 0.875 ⇒ CERTIFIES "5 of 5"
//   leave-one-out at the candidate: n=4 < CFG.minRaw ⇒ gate 3 alone forces silence, independent of bits
function buildFixtureGuard(dir) {
  initRepo(dir);
  w(dir, 'special.txt', 'v0\n');
  w(dir, 'noise.txt', 'v0\n');
  commitAt(dir, 'scaffold', 0);
  for (let i = 1; i <= 4; i++) {
    w(dir, `e/new${i}.y`, `payload ${i}\n`);
    w(dir, 'special.txt', `v${i}\n`);
    commitAt(dir, `add e/new${i}.y`, i * 2);
  }
  for (let i = 1; i <= 10; i++) {
    w(dir, 'noise.txt', `v${i}\n`);
    commitAt(dir, `noise ${i}`, 10 + i * 2);
  }
  // the candidate: the 5th birth AND the very last commit in the repository's history
  w(dir, 'e/new5.y', 'payload 5\n');
  w(dir, 'special.txt', 'v5\n');
  commitAt(dir, 'add e/new5.y', 40);
}

test('6) selftest --obligation hides the candidate\'s own commit from the table that scores it', () => {
  const dir = join(tmp, 'guard');
  buildFixtureGuard(dir);

  // sanity: the FULL model (every birth counted, candidate included) really does certify "5 of 5" —
  // without this, the test below would pass for the wrong reason (nothing to leak in the first place)
  const full = grain(['obligation', 'e/new.y', '--json'], dir);
  assert.equal(full.code, 0, full.err);
  const fj = JSON.parse(full.out);
  assert.equal(fj.births, 5, `fixture sanity — 5 births expected, got: ${JSON.stringify(fj)}`);
  assert.ok(fj.rules.some(r => r.file === 'special.txt' && r.k === 5 && r.n === 5), `fixture sanity — the FULL model must certify special.txt 5 of 5 before this guard test means anything, got: ${JSON.stringify(fj)}`);

  // the guarded instrument, scoring ONLY that last event: the table available to it must be built from the 4
  // EARLIER births alone (n=4 < CFG.minRaw=5) — nothing may fire
  const r = grain(['selftest', '--obligation', '--last', '1', '--json'], dir);
  assert.equal(r.code, 0, `exit 0 expected — stderr:\n${r.err}\nstdout:\n${r.out}`);
  const j = JSON.parse(r.out);
  assert.equal(j.n, 1, `exactly one event expected with --last 1, got: ${JSON.stringify(j)}`);
  assert.equal(j.coverage, 0, `the candidate's own commit must be excluded from its own scoring table — a leaked table would let this fire (it has all 5 births), got: ${JSON.stringify(j)}`);
});

// ===== instrument sanity: no history says so, never a crash or a hollow zero =====
test('selftest --obligation on a repository with no history discloses that, both text and --json', () => {
  const dir = join(tmp, 'no-history');
  mkdirSync(dir, { recursive: true });
  w(dir, 'a.txt', 'x\n'); // no `git init` at all
  const r = grain(['selftest', '--obligation'], dir);
  assert.equal(r.code, 0, `exit 0 expected — stderr:\n${r.err}`);
  assert.match(r.out, /needs commit history to evaluate against/, `got:\n${r.out}`);
  const rj = grain(['selftest', '--obligation', '--json'], dir);
  assert.equal(rj.code, 0, rj.err);
  const j = JSON.parse(rj.out);
  assert.equal(j.n, 0);
  assert.equal(j.coverage, null);
});

// ===== instrument sanity: reported shares stay within [0,1], and coverage is genuinely reachable =====
// The noise commits come BEFORE the births on purpose: `obligationEval` scores each candidate against a table
// built ONLY from strictly earlier footprints (see the function's own comment), so a class only reaches
// CFG.minRaw once enough PRIOR same-class births exist, and the base-rate contrast only has room once enough
// PRIOR total history exists to separate a companion's whole-history rate from its class-conditional rate. With
// noise AFTER the births (as the leak-guard fixture above deliberately arranges), no birth would ever see enough
// prior evidence and coverage would be a structural 0 — not a bug, just the wrong fixture shape for this assertion.
test('selftest --obligation reports every share within [0,1], and coverage is genuinely reachable', () => {
  const dir = join(tmp, 'shares');
  initRepo(dir);
  w(dir, 'noise.txt', 'v0\n');
  commitAt(dir, 'scaffold', 0);
  for (let i = 1; i <= 10; i++) {
    w(dir, 'noise.txt', `v${i}\n`);
    commitAt(dir, `noise ${i}`, i * 2);
  }
  for (let i = 1; i <= 7; i++) {
    w(dir, `d/new${i}.x`, `payload ${i}\n`);
    w(dir, 'reg.txt', `v${i}\n`);
    commitAt(dir, `add d/new${i}.x`, 30 + i * 2);
  }
  const r = grain(['selftest', '--obligation', '--json'], dir);
  assert.equal(r.code, 0, r.err);
  const j = JSON.parse(r.out);
  assert.ok(j.n >= 7, `at least the 7 real births expected as events, got: ${JSON.stringify(j)}`);
  for (const key of ['coverage', 'precision1', 'precision3', 'nonObviousPrecision', 'nullHot', 'nullRandom']) {
    const v = j[key];
    if (v === null) continue; // legitimately undefined when its own subset (fired / non-obvious) is empty
    assert.ok(v >= 0 && v <= 1, `${key} must be a share in [0,1], got ${v}`);
  }
  assert.ok(j.coverage > 0, `by birth 6 or 7, enough PRIOR same-class births and history exist to certify reg.txt — coverage must be > 0, got ${JSON.stringify(j)}`);

  // --last bounds the candidates evaluated, newest first — same contract as selftest --how/--where
  const r2 = grain(['selftest', '--obligation', '--last', '2', '--json'], dir);
  assert.equal(JSON.parse(r2.out).n, 2);
});

// ===== ticket 078 (a): the harness's support floor is EXACTLY the engine's, not one birth stricter =====
// The leak guard above pins the SILENT side of this boundary (4 prior births < CFG.minRaw ⇒ nothing may fire).
// This pins the SPEAKING side, which is the half ticket 078 had to measure: the hypothesis under test was that
// `obligationEval`'s per-event, strictly-prior protocol accidentally demands SIX prior births where the engine's
// own gate is `CFG.minRaw = 5`, and so under-reports real coverage. It does not — the two agree exactly, and this
// test is what keeps them agreeing.
//
// Fixture: noise.txt and reg.txt are both born in the scaffold (so neither is itself a later birth event), 10
// noise-only commits give the base-rate contrast room, then 8 births of class `d/*.x`, each also touching
// reg.txt. Events = 1 (scaffold) + 8 (the d/*.x births) = 9. Birth j sees j−1 strictly prior same-class births,
// so with the floor at CFG.minRaw = 5 exactly births 6, 7 and 8 may fire — three of them. A harness one birth
// STRICTER than the engine fires only on 7 and 8 (2); one birth LOOSER fires on 5..8 (4). Both drifts fail here.
test('selftest --obligation fires at exactly CFG.minRaw strictly-prior births — the same floor the engine applies', () => {
  const dir = join(tmp, 'floor-boundary');
  initRepo(dir);
  w(dir, 'noise.txt', 'v0\n');
  w(dir, 'reg.txt', 'v0\n');
  commitAt(dir, 'scaffold', 0);
  for (let i = 1; i <= 10; i++) {
    w(dir, 'noise.txt', `v${i}\n`);
    commitAt(dir, `noise ${i}`, i * 2);
  }
  for (let i = 1; i <= 8; i++) {
    w(dir, `d/new${i}.x`, `payload ${i}\n`);
    w(dir, 'reg.txt', `v${i}\n`);
    commitAt(dir, `add d/new${i}.x`, 30 + i * 2);
  }

  const r = grain(['selftest', '--obligation', '--json'], dir);
  assert.equal(r.code, 0, `exit 0 expected — stderr:\n${r.err}\nstdout:\n${r.out}`);
  const j = JSON.parse(r.out);
  assert.equal(j.n, 9, `fixture sanity — 1 scaffold birth + 8 d/*.x births expected as events, got: ${JSON.stringify(j)}`);
  assert.equal(
    Math.round(j.coverage * j.n),
    3,
    `the 6th birth of a class is the FIRST that may fire (5 strictly-prior births = CFG.minRaw), so births 6, 7 and 8 fire and no others — a harness one birth stricter than the engine would give 2, one birth looser would give 4; got coverage=${j.coverage} over n=${j.n}: ${JSON.stringify(j)}`
  );
  assert.equal(j.precision1, 1, `reg.txt is touched by every birth in this fixture, so every fired answer is correct — got: ${JSON.stringify(j)}`);

  // and the engine itself, asked directly, speaks at the same support — one floor, not two
  const eng = grain(['obligation', 'd/anything.x', '--json'], dir);
  assert.equal(eng.code, 0, eng.err);
  const ej = JSON.parse(eng.out);
  assert.equal(ej.births, 8, `fixture sanity — the full table sees all 8 births, got: ${JSON.stringify(ej)}`);
  assert.ok(
    ej.rules.some(x => x.file === 'reg.txt'),
    `the shipped table certifies reg.txt for this class — if it did not, the harness comparison above would be measuring nothing: ${JSON.stringify(ej)}`
  );
});
