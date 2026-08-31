// G12 — `--no-history` must apply per-invocation, even against an already-fresh cache.
// Before the fix, `ensureFresh` (grain.mjs) decided freshness from version/seeds/headSha alone and returned the
// cached model before ever looking at `opts['no-history']`, so a full index kept answering `--no-history` queries
// with full history forever. Symmetrically, a cache first built WITH `--no-history` never recovered history on a
// later flag-less call against the same HEAD, since nothing else forced a rebuild.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, appendFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-02-01T12:00:00Z', GIT_COMMITTER_DATE: '2026-02-01T12:00:00Z' };

let tmp;
const grain = (args, opts = {}) => { const r = spawnSync('node', [BIN, ...args], { cwd: opts.cwd, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const buildFixture = dir => execFileSync('node', [BUILDER, dir], { stdio: 'pipe' });
const git = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, ...gitEnv } }).trim();
const readMeta = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'meta.json'), 'utf8'));
const convCount = json => json.partitions.reduce((a, p) => a + p.conventions, 0);
// manufacture a real co-change pair well above cochangeMinSup(8): two files committed together repeatedly, nothing else in each commit
function plantCochangePair(dir) {
  for (let i = 0; i < 10; i++) {
    appendFileSync(join(dir, 'src', 'dto', 'order.dto.ts'), `// touch ${i}\n`);
    appendFileSync(join(dir, 'src', 'guards', 'order.guard.ts'), `// touch ${i}\n`);
    git(dir, 'commit', '-qam', `chore: order dto/guard touch ${i}`); } }

before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-no-history-')); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('(a) --no-history against an otherwise-fresh WITH-history cache answers with zero history-derived facts, in memory only', () => {
  const repo = join(tmp, 'fresh-with-history'); buildFixture(repo); plantCochangePair(repo);

  const full1 = JSON.parse(grain(['status', '--json'], { cwd: repo }).out);
  const N = convCount(full1), M = full1.cochangePairs;
  assert.ok(N > 0, `expected established conventions in the full index, got ${N}`);
  assert.ok(M > 0, `expected at least one co-change pair in the full index, got ${M}`);
  const metaBefore = readMeta(repo);
  assert.equal(metaBefore.historyMode, 'full');

  const noHist = JSON.parse(grain(['status', '--no-history', '--json'], { cwd: repo }).out);
  assert.equal(convCount(noHist), 0, `--no-history must show 0 established conventions on a fresh cache, got ${convCount(noHist)} (today: red — it echoes the full ${N})`);
  assert.equal(noHist.cochangePairs, 0, `--no-history must show 0 co-change pairs, got ${noHist.cochangePairs} (today: red — it echoes the full ${M})`);

  const metaAfterNoHist = readMeta(repo);
  assert.equal(metaAfterNoHist.builtAt, metaBefore.builtAt, '--no-history must be answered in memory — the persisted store must never be touched');
  assert.equal(metaAfterNoHist.historyMode, 'full', 'the persisted meta must still say full history — only the in-memory answer changed');

  const full2 = JSON.parse(grain(['status', '--json'], { cwd: repo }).out);
  assert.equal(convCount(full2), N, 'a plain call right after must return the same full model from cache, no rebuild');
  assert.equal(full2.cochangePairs, M);
  const metaAfterFull2 = readMeta(repo);
  assert.equal(metaAfterFull2.builtAt, metaBefore.builtAt, 'builtAt must be unchanged across the whole sequence — nothing was ever rebuilt');
});

test('(b) a cache built WITH --no-history recovers full history on a later call without the flag, against the same HEAD', () => {
  const repo = join(tmp, 'built-no-history'); buildFixture(repo); plantCochangePair(repo);

  const built = grain(['refresh', '--full', '--no-history'], { cwd: repo });
  assert.equal(built.code, 0, built.err);
  const meta1 = readMeta(repo);
  assert.equal(meta1.historyMode, 'none');
  assert.equal(meta1.historyReason, '--no-history flag');

  const withFlag = JSON.parse(grain(['status', '--no-history', '--json'], { cwd: repo }).out);
  assert.equal(convCount(withFlag), 0);
  assert.equal(withFlag.cochangePairs, 0);

  const withoutFlag = JSON.parse(grain(['status', '--json'], { cwd: repo }).out);
  assert.ok(convCount(withoutFlag) > 0, `expected the rebuild to recover established conventions, got ${convCount(withoutFlag)} (today: red — it keeps serving the no-history model forever)`);
  assert.ok(withoutFlag.cochangePairs > 0, `expected the rebuild to recover co-change pairs, got ${withoutFlag.cochangePairs}`);
  const meta2 = readMeta(repo);
  assert.notEqual(meta2.historyMode, 'none', 'the persisted store must now reflect a real rebuild with history');
  assert.notEqual(meta2.builtAt, meta1.builtAt, 'a real rebuild must have occurred (persisted), not another in-memory-only answer');
});

test('(c) regression: a repository with no git at all is unaffected, and its historyReason wording is now accurate', () => {
  const repo = join(tmp, 'no-git'); buildFixture(repo); rmSync(join(repo, '.git'), { recursive: true });

  const plain = JSON.parse(grain(['status', '--json'], { cwd: repo }).out);
  const plainNoHist = JSON.parse(grain(['status', '--no-history', '--json'], { cwd: repo }).out);
  assert.equal(convCount(plain), 0);
  assert.equal(convCount(plainNoHist), 0);
  assert.deepEqual(plain.history, plainNoHist.history, '--no-history changes nothing for a repo that already has no history');

  const meta = readMeta(repo);
  assert.equal(meta.historyReason, 'not a git repository (or no commits yet)', 'the corrected wording replaces the old generic "no git"');
});

test('(d) --no-refresh combined with --no-history on a WITH-history fresh cache: sensible, no crash, no stale banner', () => {
  const repo = join(tmp, 'no-refresh-no-history'); buildFixture(repo); plantCochangePair(repo);
  grain(['status'], { cwd: repo }); // build the full WITH-history cache and leave it fresh (HEAD unchanged after)
  const metaBefore = readMeta(repo);
  assert.equal(metaBefore.historyMode, 'full');

  const r = grain(['status', '--no-refresh', '--no-history', '--json'], { cwd: repo });
  assert.equal(r.code, 0, r.err);
  const json = JSON.parse(r.out);
  assert.doesNotMatch(r.out, /STALE/, 'the cache is fresh — no-refresh must not manufacture a stale banner');
  // --no-refresh guards against a git-log-driven rebuild when the cache is STALE; it is not the same thing as
  // suppressing the per-invocation --no-history flag on an already-fresh cache, so --no-history still applies here
  assert.equal(convCount(json), 0, 'the per-invocation --no-history flag must still be honored even under --no-refresh');

  const metaAfter = readMeta(repo);
  assert.equal(metaAfter.builtAt, metaBefore.builtAt, 'the persisted store must be untouched by this combination');
});
