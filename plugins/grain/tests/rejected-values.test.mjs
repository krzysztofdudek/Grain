// J5.2 — rejected patterns (H8). The change point's `nucleating` already answers "did a new value START replacing the
// old one." Nothing answers the structural opposite: "was a new value TRIED on enough scopes, and then REVERTED
// back" — a real signal that an alternative was considered and abandoned, distinct from a value quietly emerging.
//
// `rejectedValues(fact, ps, H)` walks each scope's `H.vev` chronologically, decoding via the SAME `valOf` the change
// point and `calibrate` already use (so it inherits their exact limitation: silent for every pid family outside the 5
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
// try-then-revert, 0 to 23 and 60 for the nucleation) are exactly what lands in git, no off-by-one risk
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

// (b): a young, fast repository. 40 classes decorated `@Handler` are born two per commit on days 0 to 19; on days 20
// to 23 four more handlers are born WITHOUT it, one per commit, and a trailing commit on day 60 lets all 44 clear
// CFG.freshDays. The fact still stands (KT 40.5 / 45 = 0.9 >= 7/8). In commit order the sequence is 20 conforming
// commits then 4 departing ones, 23 boundaries to cut at: one KT code costs 8.85 bits more than two KT codes split
// after the 20th commit plus log2 23 for naming the cut, above the index cost of this small repository. After the
// cut, `false` has the KT predictive (4 + ½) / (4 + 1) = 0.9 >= 7/8, so it is nucleating. A windowed detector in
// calendar days saw one window here and could not fire at all.
// `f.rejected` must NOT include 'false': each of the 4 scopes was born with it and still carries it (survived, not
// reverted), and 4 < CFG.minRaw=5 regardless — both floors refuse it, on purpose.
const N_NUC = 40, N_NEW = 4;

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
  for (let i = 0; i < N_NUC; i += 2) {
    w(repoB, `src/handlers/H${i}.ts`, decorated(i));
    w(repoB, `src/handlers/H${i + 1}.ts`, decorated(i + 1));
    commit(repoB, day(i / 2), `feat: handlers ${i} and ${i + 1}`);
  }
  for (let i = N_NUC; i < N_NUC + N_NEW; i++) {
    w(repoB, `src/handlers/H${i}.ts`, plain(i));
    commit(repoB, day(N_NUC / 2 + i - N_NUC), `feat: handler ${i} without the decorator`);
  }
  w(repoB, 'NOTES.md', 'notes\n');
  commit(repoB, day(60), 'chore: notes');

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

test('(b) a value that instead SURVIVED (nucleation) is never counted as rejected, and is reported by the change point instead', () => {
  const f = factByPid(modelIn(repoB), 'auto.deco:@Handler');
  assert.equal(f.rejected, undefined, `a survived value must not appear in f.rejected — got ${JSON.stringify(f.rejected)}`);
  assert.ok(f.trend, 'expected a trend to be computed from the birth sequence');
  assert.equal(f.trend.nucleating, 'false', `the change point should mark 'false' as nucleating — got ${JSON.stringify(f.trend)}`);
  assert.deepEqual(f.trend.shares.map(x => [x.share, x.n]), [[1, N_NUC], [0, N_NEW]], `the cut falls after the 40th birth: ${JSON.stringify(f.trend)}`);
  assert.equal(f.trend.fading, true, 'the births after the cut no longer carry the decorator');
  assert.equal(f.suppressedValue, 'false', 'nucleation stands check down on the new value');
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
