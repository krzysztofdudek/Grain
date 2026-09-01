// J2.5 — placement from move history: `placementHit`'s name-kin branch already says "*.suf files named like
// <token> live in <topDir>/" from the CURRENT tree alone. This ticket adds a second sentence, drawn from git
// history rather than the current tree: when files matching this same (suffix, token) key were historically
// RENAMED (a directory change, not a pure basename edit) OUT OF `topDir` and a supermajority (>=2/3, n>=2) of
// those renames landed in one target directory, say so — "N of M such files born here were later moved to D/".
//
// The lookup key (`model.moves[suf + '#' + token]`) is built once in `learn()` from `H.fps[*].renames` and stored
// ON THE MODEL, because `placementHit` itself never receives `H` — `ensureFresh`'s warm-cache fast path
// (grain.mjs) returns without ever calling `loadHistory`, so `H` is structurally unavailable on the hot path every
// `check`/`check-hook` call goes through.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const wIn = (dir, rel, content) => { mkdirSync(join(dir, dirname(rel)), { recursive: true }); writeFileSync(join(dir, rel), content); };
const mvIn = (dir, fromRel, toRel) => { mkdirSync(join(dir, dirname(toRel)), { recursive: true }); gitIn(dir, 'mv', fromRel, toRel); };
const commitIn = (dir, msg) => { gitIn(dir, 'add', '-A'); gitIn(dir, 'commit', '-qm', msg); };
const statusIn = dir => { const r = spawnSync('node', [BIN, 'status'], { cwd: dir, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
const checkIn = (dir, rel) => { const r = spawnSync('node', [BIN, 'check', rel], { cwd: dir, encoding: 'utf8' }); return { out: r.stdout || '', code: r.status }; };
const modelIn = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));

const H = n => `export function h${n}() { return ${n}; }\n`;
// filler present in every fixture so `placementHit`'s `files.length < 20` guard never bails early, and so the
// name-kin token group (T) stays under `cands.length * 0.5` (the "too generic to place anything" gate)
function seedFiller(dir) {
  ['invoice-issued', 'invoice-voided'].forEach(n => wIn(dir, `src/billing/${n}.handler.ts`, H(n)));
  ['user-created', 'user-deleted'].forEach(n => wIn(dir, `src/users/${n}.handler.ts`, H(n)));
  ['a1', 'a2', 'a3'].forEach(n => wIn(dir, `tests/alpha/${n}.spec.ts`, `export const ${n} = () => 1;\n`));
  ['b1', 'b2', 'b3'].forEach(n => wIn(dir, `tests/beta/${n}.spec.ts`, `export const ${n} = () => 1;\n`));
  ['u1', 'u2', 'u3', 'u4', 'u5', 'u6', 'u7'].forEach(n => wIn(dir, `src/lib/${n}.ts`, `export const ${n} = 1;\n`));
}

let tmp, repoA, repoB, repoC, repoD;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-place-moves-'));

  // ===== repo A: the RED/GREEN case. 3 files matching `order` + `.handler.ts` are born in src/staging/, then
  // moved (git mv, a directory change) to src/handlers/ in one commit, then retired (git rm) — so they contribute
  // rename history but no longer pollute the CURRENT name-kin count. The 3 files that stay put in src/staging/
  // forever are what makes `best.topDir` resolve to src/staging/ today, exactly the "such files born here" case.
  repoA = join(tmp, 'a'); mkdirSync(repoA);
  gitIn(repoA, 'init', '-q', '-b', 'main'); gitIn(repoA, 'config', 'commit.gpgsign', 'false');
  seedFiller(repoA);
  ['order-a', 'order-b', 'order-c'].forEach(n => wIn(repoA, `src/staging/${n}.handler.ts`, H(n)));
  ['order-m1', 'order-m2', 'order-m3'].forEach(n => wIn(repoA, `src/staging/${n}.handler.ts`, H(n)));
  commitIn(repoA, 'base tree');
  ['order-m1', 'order-m2', 'order-m3'].forEach(n => mvIn(repoA, `src/staging/${n}.handler.ts`, `src/handlers/${n}.handler.ts`));
  commitIn(repoA, 'move order handlers to their new home');
  ['order-m1', 'order-m2', 'order-m3'].forEach(n => gitIn(repoA, 'rm', '-q', `src/handlers/${n}.handler.ts`));
  commitIn(repoA, 'retire the staged order handlers');
  statusIn(repoA);

  // ===== repo B: the SAME layout minus any rename history at all — order-a/b/c exist, nothing was ever moved.
  // Regression control: the base placement note is unaffected, and there is no move sentence to find.
  repoB = join(tmp, 'b'); mkdirSync(repoB);
  gitIn(repoB, 'init', '-q', '-b', 'main'); gitIn(repoB, 'config', 'commit.gpgsign', 'false');
  seedFiller(repoB);
  ['order-a', 'order-b', 'order-c'].forEach(n => wIn(repoB, `src/staging/${n}.handler.ts`, H(n)));
  commitIn(repoB, 'base tree');
  statusIn(repoB);

  // ===== repo C: the THRESHOLD case. Same 3 always-present order-a/b/c files (topDir = src/staging/ again), but
  // 4 retired files split their moves evenly across two different targets (2 to handlersA/, 2 to handlersB/) — the
  // strongest target carries only 2 of 4 (share 0.5 < 2/3), so the move sentence must NOT appear even though
  // `model.moves` has real data for this key.
  repoC = join(tmp, 'c'); mkdirSync(repoC);
  gitIn(repoC, 'init', '-q', '-b', 'main'); gitIn(repoC, 'config', 'commit.gpgsign', 'false');
  seedFiller(repoC);
  ['order-a', 'order-b', 'order-c'].forEach(n => wIn(repoC, `src/staging/${n}.handler.ts`, H(n)));
  ['order-p1', 'order-p2', 'order-q1', 'order-q2'].forEach(n => wIn(repoC, `src/staging/${n}.handler.ts`, H(n)));
  commitIn(repoC, 'base tree');
  mvIn(repoC, 'src/staging/order-p1.handler.ts', 'src/handlersA/order-p1.handler.ts');
  mvIn(repoC, 'src/staging/order-p2.handler.ts', 'src/handlersA/order-p2.handler.ts');
  commitIn(repoC, 'move some order handlers to handlersA');
  mvIn(repoC, 'src/staging/order-q1.handler.ts', 'src/handlersB/order-q1.handler.ts');
  mvIn(repoC, 'src/staging/order-q2.handler.ts', 'src/handlersB/order-q2.handler.ts');
  commitIn(repoC, 'move some order handlers to handlersB');
  ['src/handlersA/order-p1.handler.ts', 'src/handlersA/order-p2.handler.ts', 'src/handlersB/order-q1.handler.ts', 'src/handlersB/order-q2.handler.ts']
    .forEach(p => gitIn(repoC, 'rm', '-q', p));
  commitIn(repoC, 'retire the moved order handlers');
  statusIn(repoC);

  // ===== repo D: the SAME-DIRECTORY-RENAME guard. ticket-a/b/c always live in src/box/; ticket-r1 is born in
  // src/box/ and renamed to ticket-r1-renamed WITHIN src/box/ — a pure filename change, oldDir === newDir. That
  // must contribute NOTHING to `model.moves` for this key.
  repoD = join(tmp, 'd'); mkdirSync(repoD);
  gitIn(repoD, 'init', '-q', '-b', 'main'); gitIn(repoD, 'config', 'commit.gpgsign', 'false');
  seedFiller(repoD);
  ['ticket-a', 'ticket-b', 'ticket-c'].forEach(n => wIn(repoD, `src/box/${n}.handler.ts`, H(n)));
  wIn(repoD, 'src/box/ticket-r1.handler.ts', H('ticket-r1'));
  commitIn(repoD, 'base tree');
  mvIn(repoD, 'src/box/ticket-r1.handler.ts', 'src/box/ticket-r1-renamed.handler.ts');
  commitIn(repoD, 'rename ticket-r1 in place');
  statusIn(repoD);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('(a) files historically moved out of the name-kin directory earn a second sentence naming the target', () => {
  wIn(repoA, 'src/new/order-fresh.handler.ts', H('fresh'));
  const c = checkIn(repoA, 'src/new/order-fresh.handler.ts');
  assert.match(c.out, /\[grain\] placement: `\*\.handler\.ts` files named like `order` live in `src\/staging\/` — 3 of 3; `src\/new\/` holds none/,
    'the base name-kin note must still fire');
  assert.match(c.out, /3 of 3 such files born here were later moved to `src\/handlers\/`/,
    'RED today: no such sentence exists yet — model.moves is not built and placementHit does not consult it');
});

test('(b) the same layout with no rename history draws the base note but never the move sentence', () => {
  wIn(repoB, 'src/new/order-fresh.handler.ts', H('fresh'));
  const c = checkIn(repoB, 'src/new/order-fresh.handler.ts');
  assert.match(c.out, /\[grain\] placement: `\*\.handler\.ts` files named like `order` live in `src\/staging\/` — 3 of 3; `src\/new\/` holds none/);
  assert.doesNotMatch(c.out, /such files born here were later moved to/,
    'purely additive: with no renames in history there is nothing to append');
});

test('(c) a move history split roughly evenly across two targets stays under the 2/3 gate and says nothing extra', () => {
  const m = modelIn(repoC);
  const row = m.moves && m.moves['handler.ts#order'];
  assert.ok(row, 'model.moves must carry real data for this key');
  assert.equal(row['src/staging→src/handlersA'], 2);
  assert.equal(row['src/staging→src/handlersB'], 2);

  wIn(repoC, 'src/new/order-fresh.handler.ts', H('fresh'));
  const c = checkIn(repoC, 'src/new/order-fresh.handler.ts');
  assert.match(c.out, /\[grain\] placement: `\*\.handler\.ts` files named like `order` live in `src\/staging\/` — 3 of 3; `src\/new\/` holds none/);
  assert.doesNotMatch(c.out, /such files born here were later moved to/,
    'the strongest target carries only 2 of 4 (share 0.5 < 2/3) — the gate must refuse it');
});

test('(d) a same-directory rename (pure filename change) contributes nothing to model.moves', () => {
  const m = modelIn(repoD);
  assert.ok(!m.moves || !m.moves['handler.ts#ticket'], 'oldDir === newDir must never reach model.moves');

  wIn(repoD, 'src/new/ticket-fresh.handler.ts', H('fresh'));
  const c = checkIn(repoD, 'src/new/ticket-fresh.handler.ts');
  assert.match(c.out, /\[grain\] placement: `\*\.handler\.ts` files named like `ticket` live in `src\/box\/` — 4 of 4; `src\/new\/` holds none/);
  assert.doesNotMatch(c.out, /such files born here were later moved to/);
});
