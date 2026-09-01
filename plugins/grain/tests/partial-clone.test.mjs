// §035 — a `blob:none`/`tree:0`/`blob:limit=N` partial clone (the default shape of `actions/checkout` and most CI)
// made grain's history walk crawl — every historical blob not already present triggers its own serialized `git
// fetch` to the promisor remote (measured: 16+ min to reach 8000/8502 blobs) — or hard-fail outright on a ref the
// remote will no longer serve. grain said nothing either way; it just hung.
//
// Fix (history.mjs): `partialCloneFilter(gitdir)` reads `remote.*.promisor`/`remote.*.partialclonefilter` via
// `git config --get-regexp` (never hardcoding `origin` — a repo can name its promisor remote anything), consulted
// by `loadHistory` in the same guard site, same shape, same "degrade, do not crawl or crash" verdict as the
// existing shallow-clone check just above it. No real partial clone (i.e. no network) is needed to test detection:
// it is a pure git-config read, so setting the same config keys git itself sets is a faithful fixture.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadHistory, partialCloneFilter } from '../engine/history.mjs';

let tmp;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' };
const gitIn = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });

before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-partial-clone-')); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src/a.js'), 'export function alpha() { return 1; }\n');
  gitIn(dir, 'add', '-A'); gitIn(dir, 'commit', '-qm', 'add alpha');
}
function freshStore(dir) { const store = { dir: join(dir, 'cache'), historyPath: join(dir, 'cache', 'history.json') };
  mkdirSync(store.dir, { recursive: true }); return store; }

test('(1) an ordinary full clone: partialCloneFilter is null, loadHistory walks normally', async () => {
  const gitdir = join(tmp, 'full-repo'); initRepo(gitdir);
  assert.equal(partialCloneFilter(gitdir), null);
  const { H, mode, reason } = await loadHistory({ gitdir, store: freshStore(join(tmp, 'full-store')), log: () => {} });
  assert.equal(mode, 'full');
  assert.equal(reason, undefined);
  assert.ok(H, 'a full clone must produce real history');
});

test('(2) remote.origin.promisor=true + partialclonefilter=blob:none: detected, and loadHistory degrades instead of walking', async () => {
  const gitdir = join(tmp, 'partial-blobnone'); initRepo(gitdir);
  gitIn(gitdir, 'remote', 'add', 'origin', 'https://example.invalid/repo.git');
  gitIn(gitdir, 'config', 'remote.origin.promisor', 'true');
  gitIn(gitdir, 'config', 'remote.origin.partialclonefilter', 'blob:none');
  assert.equal(partialCloneFilter(gitdir), 'blob:none');

  const { H, mode, reason } = await loadHistory({ gitdir, store: freshStore(join(tmp, 'partial-blobnone-store')), log: () => {} });
  assert.equal(H, null, 'no history walk must be attempted on a detected partial clone');
  assert.equal(mode, 'none');
  assert.match(reason, /partial clone \(blob:none\)/);
  assert.match(reason, /history unavailable, weights flat/);
  assert.match(reason, /git backfill/, 'the exact remedy command must be named');
  assert.match(reason, /grain refresh --full/, 'the retry path must be named');
});

test('(3) the filter name is surfaced correctly for tree:0 and blob:limit=N — they fail at different severities', async () => {
  const gitdirTree = join(tmp, 'partial-tree0'); initRepo(gitdirTree);
  gitIn(gitdirTree, 'remote', 'add', 'origin', 'https://example.invalid/repo.git');
  gitIn(gitdirTree, 'config', 'remote.origin.promisor', 'true');
  gitIn(gitdirTree, 'config', 'remote.origin.partialclonefilter', 'tree:0');
  assert.equal(partialCloneFilter(gitdirTree), 'tree:0');

  const gitdirLimit = join(tmp, 'partial-bloblimit'); initRepo(gitdirLimit);
  gitIn(gitdirLimit, 'remote', 'add', 'origin', 'https://example.invalid/repo.git');
  gitIn(gitdirLimit, 'config', 'remote.origin.promisor', 'true');
  gitIn(gitdirLimit, 'config', 'remote.origin.partialclonefilter', 'blob:limit=1m');
  assert.equal(partialCloneFilter(gitdirLimit), 'blob:limit=1m');
});

test('(4) a differently-named promisor remote is still detected — never hardcode "origin"', async () => {
  const gitdir = join(tmp, 'partial-customremote'); initRepo(gitdir);
  gitIn(gitdir, 'remote', 'add', 'upstream-mirror', 'https://example.invalid/repo.git');
  gitIn(gitdir, 'config', 'remote.upstream-mirror.promisor', 'true');
  gitIn(gitdir, 'config', 'remote.upstream-mirror.partialclonefilter', 'blob:none');
  assert.equal(partialCloneFilter(gitdir), 'blob:none');
});

test('(5) a shallow clone keeps its existing behaviour, unaffected by the new check', async () => {
  const origin = join(tmp, 'shallow-origin'); initRepo(origin);
  writeFileSync(join(origin, 'src/b.js'), 'export function beta() { return 2; }\n');
  gitIn(origin, 'add', '-A'); gitIn(origin, 'commit', '-qm', 'add beta');
  const shallowRepo = join(tmp, 'shallow-copy');
  execFileSync('git', ['clone', '--depth', '1', `file://${origin}`, shallowRepo], { stdio: 'pipe' });
  assert.equal(partialCloneFilter(shallowRepo), null, 'an ordinary shallow clone has no promisor config — the two checks must not interfere');

  const { H, mode, reason } = await loadHistory({ gitdir: shallowRepo, store: freshStore(join(tmp, 'shallow-store')), log: () => {} });
  assert.equal(H, null); assert.equal(mode, 'none');
  assert.equal(reason, 'shallow clone — history unavailable, weights flat', 'the shallow-clone reason must be exactly what it was before this fix');
});

test('(6) shallow AND partial together: the shallow check runs first and wins — no interference either direction', async () => {
  const origin = join(tmp, 'both-origin'); initRepo(origin);
  const repo = join(tmp, 'both-copy');
  execFileSync('git', ['clone', '--depth', '1', `file://${origin}`, repo], { stdio: 'pipe' });
  gitIn(repo, 'remote', 'set-url', 'origin', 'https://example.invalid/repo.git');
  gitIn(repo, 'config', 'remote.origin.promisor', 'true');
  gitIn(repo, 'config', 'remote.origin.partialclonefilter', 'blob:none');
  // both signals are genuinely present...
  assert.equal(partialCloneFilter(repo), 'blob:none');
  // ...but loadHistory's shallow guard is checked first, so its reason wins, exactly as before this fix
  const { mode, reason } = await loadHistory({ gitdir: repo, store: freshStore(join(tmp, 'both-store')), log: () => {} });
  assert.equal(mode, 'none');
  assert.equal(reason, 'shallow clone — history unavailable, weights flat');
});
