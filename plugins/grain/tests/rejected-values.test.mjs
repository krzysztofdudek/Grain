// J5.2 — rejected patterns (H8). `trendsFor`'s `nucleating` already answers "did a new value START replacing the
// old one." Nothing answers the structural opposite: "was a new value TRIED on enough scopes, and then REVERTED
// back" — a real signal that an alternative was considered and abandoned, distinct from a value quietly emerging.
//
// `rejectedValues(fact, ps, H)` walks each scope's `H.vev` chronologically, decoding via the SAME `valOf` `trendsFor`
// and `calibrate` already use (so it inherits their exact limitation: silent for every pid family outside the 5
// `valOf` decodes — nameshape/first1/ret/deco:@/extends: — documented by export.mjs's `valueTracked`). Per distinct
// value v != fact.exp: `tried` = scopes where v ever appeared, `reverted` = of those, scopes whose FINAL decoded
// value is not v (i.e. it came back to something else, `fact.exp` in every fixture here). A scope whose final value
// IS v survived instead — that's nucleation, not a rejection, and must never show up here.
// Speaks when tried >= CFG.minRaw and reverted/tried >= 2/3 — the same supermajority proportion used throughout
// this codebase (altMarkerFor, placementHit, markerObs, authorConcentration, J3.4's twin threshold).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CFG } from '../engine/config.mjs';
import { factNotes } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repoA, repoB, repoC;

// dates are computed off one anchor, never hand-added calendar arithmetic, so the day offsets below (0/5/10 for the
// try-then-revert, 0/100/150/200 for the nucleation windows) are exactly what lands in git, no off-by-one risk
const T0 = new Date('2026-01-01T12:00:00Z');
const day = n => new Date(T0.getTime() + n * 86400000).toISOString().slice(0, 10);
const dateEnv = (iso, author) => ({ GIT_AUTHOR_NAME: author, GIT_AUTHOR_EMAIL: `${author.toLowerCase()}@x`, GIT_COMMITTER_NAME: author, GIT_COMMITTER_EMAIL: `${author.toLowerCase()}@x`, TZ: 'UTC', GIT_AUTHOR_DATE: `${iso}T12:00:00Z`, GIT_COMMITTER_DATE: `${iso}T12:00:00Z` });
const gitIn = (repo, iso, author, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...dateEnv(iso, author) } });
const w = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const commit = (repo, iso, msg, author = 'Dev') => { gitIn(repo, iso, author, 'add', '-A'); gitIn(repo, iso, author, 'commit', '-qm', msg); };
const initRepo = name => { const repo = join(tmp, name); mkdirSync(repo);
  gitIn(repo, day(0), 'Dev', 'init', '-q', '-b', 'main'); gitIn(repo, day(0), 'Dev', 'config', 'commit.gpgsign', 'false'); return repo; };
const grain = (repo, args) => spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' });
const grainOut = (repo, args) => { const r = grain(repo, args); assert.equal(r.status, 0, r.stdout + r.stderr); return (r.stdout || '').replace(/\n$/, ''); };
const modelIn = repo => { assert.equal(grain(repo, ['status']).status, 0); return JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8')); };
const factByPid = (model, pid) => { const fs2 = model.partitions.flatMap(p => p.facts).filter(f => f.pid === pid);
  assert.equal(fs2.length, 1, `exactly one accepted \`${pid}\` fact expected, got ${fs2.length}`); return fs2[0]; };

// (a)+(d): 20 classes decorated `@Handler` from day 0. `K` (= CFG.minRaw) of them lose the decorator on day 5 and
// regain it on day 10 — a genuine try-then-revert, tried=K, reverted=K, reverted/tried = 1 >= 2/3.
const N = 20, K = CFG.minRaw;
const decorated = i => `@Handler\nexport class H${i} { run() { return ${i}; } }\n`;
const plain = i => `export class H${i} { run() { return ${i}; } }\n`;

// (b): 20 classes decorated `@Handler` from day 0 (a small population never clears the acceptance bits gate at
// all — verified empirically, not just asserted). Two of them lose the decorator for good — one on day 100
// (author Ann), one on day 150 (author Bea) — and never regain it. `trendsFor`'s own gates, worked by hand and
// cross-checked against the engine's own output:
//   nWin = ceil((day200 - day0) / 90d) = ceil(200/90) = 3 windows, cutoffs day20 / day110 / day200.
//   day20:  0 of 20 switched  -> share 20/20 = 1.00, y = 0
//   day110: 1 of 20 switched  -> share 19/20 = 0.95, y = 0.05
//   day200: 2 of 20 switched  -> share 18/20 = 0.90, y = 0.10   (last window, n=20 >= 4 every time)
//   slope of y over x=[0,1,2]: mean x=1, mean y=0.05; sum((x-mx)(y-my)) = (-1)(-.05)+(0)(0)+(1)(.05) = .1;
//     sum((x-mx)^2) = 1+0+1 = 2; slope = .1/2 = 0.05 > 0.02 (gate)
//   (1 - last.share) = 0.10 > 0.05 (gate); minority = {'false': {Ann, Bea}}, size 2 >= 2 (gate) -> nucleating='false'
// `f.rejected` must NOT include 'false' here: each of the 2 scopes' final decoded value IS 'false' (survived, not
// reverted), and 2 < CFG.minRaw=5 regardless — both floors refuse it, on purpose.
const N_NUC = 20;

// (c): the same try-then-revert shape as (a), but on `auto.call:validate` — a pid family `valOf` cannot decode.
// `f.rejected` must be absent, proving the documented `valOf` boundary rather than an accidental empty result.
const callDecorated = i => `export class C${i} { run() { validate(); return ${i}; } }\n`;
const callPlain = i => `export class C${i} { run() { return ${i}; } }\n`;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-rejected-'));

  repoA = initRepo('a');
  for (let i = 0; i < N; i++) w(repoA, `src/handlers/H${i}.ts`, decorated(i));
  commit(repoA, day(0), 'feat: handlers');
  for (let i = 0; i < K; i++) w(repoA, `src/handlers/H${i}.ts`, plain(i));
  commit(repoA, day(5), 'chore: drop the Handler decorator');
  for (let i = 0; i < K; i++) w(repoA, `src/handlers/H${i}.ts`, decorated(i));
  commit(repoA, day(10), 'chore: restore the Handler decorator');
  // a trailing commit well past CFG.freshDays=14 (from day 0): every scope must clear the freshness floor
  // (heldSummary/`sraw`'s survival filter) or the fact never gets a printed population to begin with
  w(repoA, 'NOTES.md', 'notes\n');
  commit(repoA, day(30), 'chore: notes');

  repoB = initRepo('b');
  for (let i = 0; i < N_NUC; i++) w(repoB, `src/handlers/H${i}.ts`, decorated(i));
  commit(repoB, day(0), 'feat: handlers');
  w(repoB, 'src/handlers/H0.ts', plain(0));
  commit(repoB, day(100), 'chore: drop the Handler decorator on H0', 'Ann');
  w(repoB, 'src/handlers/H1.ts', plain(1));
  commit(repoB, day(150), 'chore: drop the Handler decorator on H1', 'Bea');
  w(repoB, 'NOTES.md', 'notes\n');
  commit(repoB, day(200), 'chore: notes');

  repoC = initRepo('c');
  for (let i = 0; i < N; i++) w(repoC, `src/handlers/C${i}.ts`, callDecorated(i));
  commit(repoC, day(0), 'feat: handlers');
  for (let i = 0; i < K; i++) w(repoC, `src/handlers/C${i}.ts`, callPlain(i));
  commit(repoC, day(5), 'chore: drop the validate() call');
  for (let i = 0; i < K; i++) w(repoC, `src/handlers/C${i}.ts`, callDecorated(i));
  commit(repoC, day(10), 'chore: restore the validate() call');
  w(repoC, 'NOTES.md', 'notes\n');
  commit(repoC, day(30), 'chore: notes');
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

test('(a) a decorator tried and reverted on >= CFG.minRaw scopes is named in f.rejected', () => {
  const f = factByPid(modelIn(repoA), 'auto.deco:@Handler');
  assert.equal(f.exp, 'true');
  assert.deepEqual(f.rejected, [{ v: 'false', tried: K, reverted: K }],
    `expected exactly one rejected value, false, tried/reverted ${K} times — got ${JSON.stringify(f.rejected)}`);
});

test('(a) factNotes and `grain where` render the clause through deviationPhrase, never a raw `false`', () => {
  const f = factByPid(modelIn(repoA), 'auto.deco:@Handler');
  const note = factNotes(f);
  assert.match(note, /is not annotated with `@Handler` tried 5×, reverted 5× — a rejection, not an alternative/, note);
  assert.doesNotMatch(note, /`false`/, `must never print the raw pid value: ${note}`);
  const where = grainOut(repoA, ['where', 'handlers']);
  assert.match(where, /is not annotated with `@Handler` tried 5×, reverted 5× — a rejection, not an alternative/,
    `\`where\`'s group card must carry the clause, got:\n${where}`);
  assert.doesNotMatch(where.split('\n').filter(l => l.includes('tried')).join('\n'), /`false`/);
});

test('(b) a value that instead SURVIVED (nucleation) is never counted as rejected, and is reported by trendsFor instead', () => {
  const f = factByPid(modelIn(repoB), 'auto.deco:@Handler');
  assert.equal(f.rejected, undefined, `a survived value must not appear in f.rejected — got ${JSON.stringify(f.rejected)}`);
  assert.ok(f.trend, 'expected a trend to be computed given >= 3 windows of history');
  assert.equal(f.trend.nucleating, 'false', `trendsFor's own gates should independently mark 'false' as nucleating — got ${JSON.stringify(f.trend)}`);
});

test('(c) a pid outside valOf\'s 5 decodable families never populates f.rejected, even with the identical try-then-revert shape', () => {
  const f = factByPid(modelIn(repoC), 'auto.call:validate');
  assert.equal(f.exp, 'true');
  assert.equal(f.rejected, undefined, `auto.call: is not one of valOf's decodable families — got ${JSON.stringify(f.rejected)}`);
});

test('(d) an incremental refresh yields a byte-identical f.rejected to a full rebuild', () => {
  const incremental = JSON.stringify(factByPid(modelIn(repoA), 'auto.deco:@Handler').rejected);
  assert.notEqual(incremental, undefined, 'the comparison must have something to compare');
  rmSync(join(repoA, '.grain', 'cache'), { recursive: true });
  const full = JSON.stringify(factByPid(modelIn(repoA), 'auto.deco:@Handler').rejected);
  assert.equal(full, incremental, 'a full rebuild must equal the incremental model byte for byte');
});
