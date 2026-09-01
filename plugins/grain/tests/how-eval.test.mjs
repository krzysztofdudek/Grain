// J2.3 — `selftest --how` harness: leave-one-out precision/recall of `how` against a naive grep baseline, over
// the repository's own history. `howEval` (core.mjs) is the mechanism under test here; the maintainer's own
// go/no-go decision on a real corpus is explicitly OUT OF SCOPE for this file (see plan.md §J2.3).
//
// The fixture below is built to be hand-computable, not realistic: every commit's vocabulary is deliberately
// disjoint across topics (widget/gizmo/signal/console) except for two intentionally-paired "sibling" commits per
// topic (W1/W2, G1/G2) that share exactly two of their three message tokens and touch exactly the same two files
// — so a leave-one-out query for one sibling has exactly one candidate to match (the other), at a computable IDF
// score. "calibrate signal offset" (S1) and "polish console output" (noise) each use vocabulary found nowhere
// else in the fixture, so their leave-one-out query can never match anything — the harness's `noMatch` case.
//
// Every file's own basename IS its topic word (`widget.ts`, `gizmo.ts`, `signal.ts`, `console.ts`), so the grep
// baseline finds each candidate's own files via its PATH alone, independent of `how`/history entirely — this is
// what makes the grep arm's numbers hand-computable too (see the per-candidate table in test (a)).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

let tmp, repo;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const grain = (args, cwd) => { const r = spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };

const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const wBin = (dir, rel, bytes) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, Buffer.from(bytes)); };

const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
let day = 0;
function commit(dir, msg) { day += 3; const d = new Date(T0 + day * 86400000).toISOString();
  gitIn(dir, 'add', '-A');
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg], { encoding: 'utf8', env: { ...process.env, ...gitEnv, GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d } }); }

// 10 commits: init package(1f) · scaffold(1f) · binary asset(1f) · scratch noise(1f) · W1(2f) · console noise(2f)
// · G1(2f) · W2(2f) (same 2 files as W1) · G2(2f) (same 2 files as G1) · S1(2f, unique vocabulary). Eligible
// candidates (>=2 files): W1, console-noise, G1, W2, G2, S1 — six, in that chronological order.
function buildFixture(dir) {
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
  w(dir, 'package.json', JSON.stringify({ name: 'how-eval-fixture', version: '1.0.0', private: true, type: 'module' }, null, 2) + '\n');
  commit(dir, 'init package'); // its own 1-file commit — must NOT combine with the next commit into a 2-file candidate

  w(dir, 'src/base.ts', `export class Base { id = ''; }\n`);
  commit(dir, 'scaffold base');

  wBin(dir, 'assets/blob.bin', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 255, 254, 253]); // a NUL byte inside — must never be grep'd as text
  commit(dir, 'add binary asset');

  w(dir, 'src/misc/scratch.ts', `export const scratch = 1;\n`);
  commit(dir, 'tidy scratch area');

  w(dir, 'src/widget/widget.ts', `export class Widget { width = 0; depth = 0; }\n`);
  w(dir, 'src/widget/widget.spec.ts', `export function testWidget(): boolean { return true; }\n`);
  commit(dir, 'adjust widget width'); // W1

  w(dir, 'src/misc/console.ts', `export class ConsoleWriter { write(msg: string): void {} }\n`);
  w(dir, 'src/misc/console.spec.ts', `export function testConsole(): boolean { return true; }\n`);
  commit(dir, 'polish console output'); // noise, but a 2-file candidate too — no sibling anywhere

  w(dir, 'src/gizmo/gizmo.ts', `export class Gizmo { speed = 0; power = 0; }\n`);
  w(dir, 'src/gizmo/gizmo.spec.ts', `export function testGizmo(): boolean { return true; }\n`);
  commit(dir, 'tune gizmo speed'); // G1

  w(dir, 'src/widget/widget.ts', `export class Widget { width = 0; depth = 1; }\n`);
  w(dir, 'src/widget/widget.spec.ts', `export function testWidget(): boolean { return false; }\n`);
  commit(dir, 'adjust widget depth'); // W2 — same two files as W1

  w(dir, 'src/gizmo/gizmo.ts', `export class Gizmo { speed = 1; power = 1; }\n`);
  w(dir, 'src/gizmo/gizmo.spec.ts', `export function testGizmo(): boolean { return false; }\n`);
  commit(dir, 'tune gizmo power'); // G2 — same two files as G1

  w(dir, 'src/signal/signal.ts', `export class Signal { offset = 0; }\n`);
  w(dir, 'src/signal/signal.spec.ts', `export function testSignal(): boolean { return true; }\n`);
  commit(dir, 'calibrate signal offset'); // S1 — unique vocabulary, no sibling
}

before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-how-eval-')); repo = join(tmp, 'fixture'); day = 0; buildFixture(repo); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

const shaOf = subject => gitIn(repo, 'log', '--format=%H%x1f%s').trim().split('\n').map(l => l.split('\x1f')).find(([, s]) => s === subject)?.[0];

test('(a) hand-verified precision/recall, per candidate and in aggregate, over all six eligible candidates', () => {
  const j = JSON.parse(grain(['selftest', '--how', '--json'], repo).out.replace(/\nas of .*$/, ''));
  assert.equal(j.n, 6, `six candidates have >=2 files: W1, console-noise, G1, W2, G2, S1 — got n=${j.n}`);
  assert.equal(j.noMatch, 2, `console-noise and S1 share no vocabulary with anything else — got noMatch=${j.noMatch}`);

  // per-candidate table (hand-computed):
  //   W1            how P=1 R=1 (sibling W2 carries 2/3 query tokens, IDF score 2/3 >= 0.34)   grep P=1 R=1 (own path)
  //   console-noise how P=0 R=0 (no sibling anywhere)                                           grep P=1 R=1 (own path)
  //   G1            how P=1 R=1 (sibling G2)                                                    grep P=1 R=1 (own path)
  //   W2            how P=1 R=1 (sibling W1)                                                    grep P=1 R=1 (own path)
  //   G2            how P=1 R=1 (sibling G1)                                                    grep P=1 R=1 (own path)
  //   S1            how P=0 R=0 (unique vocabulary)                                             grep P=1 R=1 (own path)
  // how:  mean P = mean R = (1+0+1+1+1+0)/6 = 0.6667; median of [0,0,1,1,1,1] = 1
  // grep: mean P = mean R = 1; median = 1
  const close = (got, want, label) => assert.ok(Math.abs(got - want) < 1e-9, `${label}: got ${got}, want ${want}`);
  close(j.how.meanP, 4 / 6, 'how.meanP'); close(j.how.meanR, 4 / 6, 'how.meanR');
  close(j.how.medP, 1, 'how.medP'); close(j.how.medR, 1, 'how.medR');
  close(j.grep.meanP, 1, 'grep.meanP'); close(j.grep.meanR, 1, 'grep.meanR');
  close(j.grep.medP, 1, 'grep.medP'); close(j.grep.medR, 1, 'grep.medR');

  // F1 = 2PR/(P+R), 0 when P+R=0 — per candidate: W1=1, console-noise=0, G1=1, W2=1, G2=1, S1=0 for `how`
  // (every candidate is either a clean sibling hit, P=R=1, or a clean total miss, P=R=0); grep is P=R=1 always
  // in this fixture (every basename IS its topic word), so grep's F1 is 1 for all six — this fixture cannot show
  // F1 distinguishing the two arms (see docs/validation.md's real-corpus gate result for that), it only proves
  // the mean/median-of-F1 aggregation itself is computed correctly from a non-trivial [1,0,1,1,1,0] input.
  close(j.how.meanF1, 4 / 6, 'how.meanF1'); close(j.how.medF1, 1, 'how.medF1');
  close(j.grep.meanF1, 1, 'grep.meanF1'); close(j.grep.medF1, 1, 'grep.medF1');
});

test('(a2) isolating a single sibling-pair candidate with --last confirms its individual P/R', () => {
  // --last 3 takes the three most recent eligible candidates in chronological order: W2, G2, S1
  const j = JSON.parse(grain(['selftest', '--how', '--last', '3', '--json'], repo).out.replace(/\nas of .*$/, ''));
  assert.equal(j.n, 3, `expected exactly W2, G2, S1 — got n=${j.n}`);
  assert.equal(j.noMatch, 1, 'only S1 (of these three) has no sibling');
  // W2 and G2 both score how P=R=1, S1 scores how P=R=0 -> mean 2/3, median 1
  const close = (got, want, label) => assert.ok(Math.abs(got - want) < 1e-9, `${label}: got ${got}, want ${want}`);
  close(j.how.meanP, 2 / 3, 'how.meanP'); close(j.how.medP, 1, 'how.medP');
  close(j.grep.meanP, 1, 'grep.meanP'); close(j.grep.medP, 1, 'grep.medP');
});

test('(b) grep baseline correctness: signal.ts is correctly counted a hit, and nothing else is (isolated via --last 1)', () => {
  // --last 1 isolates S1 alone: its truth is exactly {signal.ts, signal.spec.ts}. grep P=R=1 means BOTH of those
  // files were found (recall) AND no other tracked path (widget.ts, console.ts, blob.bin, etc.) was wrongly
  // counted a hit (precision) — a control file that SHOULD match and a population that should NOT, in one number.
  const j = JSON.parse(grain(['selftest', '--how', '--last', '1', '--json'], repo).out.replace(/\nas of .*$/, ''));
  assert.equal(j.n, 1); assert.equal(j.noMatch, 1, 'S1 has no sibling — `how` predicts nothing');
  assert.equal(j.grep.meanP, 1, `grep precision must be exactly 1 — a false-positive file would pull this below 1: ${JSON.stringify(j)}`);
  assert.equal(j.grep.meanR, 1, `grep recall must be exactly 1 — a missed truth file would pull this below 1: ${JSON.stringify(j)}`);
  assert.equal(j.how.meanP, 0); assert.equal(j.how.meanR, 0);
});

test('(c) leave-one-out: S1 cannot match itself, though it trivially would without the exclusion', () => {
  // Without leave-one-out, a live `grain how` query built from S1's own words matches S1's own footprint
  // perfectly — proving the harness's exclusion is load-bearing, not a no-op.
  const raw = JSON.parse(grain(['how', 'calibrate signal offset', '--json'], repo).out);
  assert.equal(raw.matches.length, 1, `S1 must self-match when it is not excluded: ${JSON.stringify(raw)}`);
  assert.equal(raw.matches[0].sha, shaOf('calibrate signal offset'));
  const byRel = Object.fromEntries(raw.places.map(p => [p.rel, p]));
  assert.equal(byRel['src/signal/signal.ts']?.k, 1, 'a lone match reports 1/1 on both its files');
  assert.equal(byRel['src/signal/signal.spec.ts']?.k, 1);

  // With leave-one-out (howEval, exercised through --last 1 == S1 alone), the SAME intent predicts nothing.
  const j = JSON.parse(grain(['selftest', '--how', '--last', '1', '--json'], repo).out.replace(/\nas of .*$/, ''));
  assert.equal(j.noMatch, 1, 'the harness must not let S1 match its own excluded footprint');
  assert.equal(j.how.meanP, 0); assert.equal(j.how.meanR, 0);
});

test('(d) noMatch accounting: no-match candidates count in n and in every mean/median, never excluded', () => {
  const j = JSON.parse(grain(['selftest', '--how', '--json'], repo).out.replace(/\nas of .*$/, ''));
  assert.equal(j.n, 6, 'noMatch candidates are still part of n');
  assert.equal(j.noMatch, 2);
  assert.ok(j.how.meanP < 1 && j.how.meanP > 0, `if the two no-match candidates were excluded, meanP would be exactly 1 — got ${j.how.meanP}`);
});

test('(e) `selftest --how` text output has the documented shape, and --json carries the same numbers', () => {
  const r = grain(['selftest', '--how'], repo);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^how: P=\d+\.\d\d R=\d+\.\d\d F1=\d+\.\d\d \(median P=\d+\.\d\d R=\d+\.\d\d F1=\d+\.\d\d\) · grep: P=\d+\.\d\d R=\d+\.\d\d F1=\d+\.\d\d \(median P=\d+\.\d\d R=\d+\.\d\d F1=\d+\.\d\d\) · n=\d+ · no-match=\d+$/m, r.out);
  assert.match(r.out, /\nas of [0-9a-f]{7}/, 'every answer ends with the freshness stamp');

  const text = r.out.split('\n')[0];
  const j = JSON.parse(grain(['selftest', '--how', '--json'], repo).out.replace(/\nas of .*$/, ''));
  const f = x => x.toFixed(2);
  assert.equal(text, `how: P=${f(j.how.meanP)} R=${f(j.how.meanR)} F1=${f(j.how.meanF1)} (median P=${f(j.how.medP)} R=${f(j.how.medR)} F1=${f(j.how.medF1)}) · grep: P=${f(j.grep.meanP)} R=${f(j.grep.meanR)} F1=${f(j.grep.meanF1)} (median P=${f(j.grep.medP)} R=${f(j.grep.medR)} F1=${f(j.grep.medF1)}) · n=${j.n} · no-match=${j.noMatch}`);
});

test('(f) plain `selftest` and `mutate-test` are unaffected by --how (regression control)', () => {
  const a = grain(['selftest'], repo);
  assert.equal(a.code, 0, a.err);
  assert.match(a.out, /^selftest: \d+\/\d+ planted deviations caught · \d+ false fires · \d+ unsupported$/m, a.out);

  const b = grain(['mutate-test'], repo);
  assert.equal(b.code, 0, b.err);
  const parsed = JSON.parse(b.out.replace(/\nas of .*$/, ''));
  assert.deepEqual(Object.keys(parsed).sort(), ['cases', 'detected', 'falseFire', 'missed', 'silentOK', 'unsupported'].sort());
});
