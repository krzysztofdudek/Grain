// J2.1 — `H.fps`: a per-commit footprint (sha/ts/author/agent/fix/toks/files/scopes/renames) recorded during replay(),
// consumed by later match-by-example queries (J2.2+). Covers: the mega-commit cap excluding bulk commits from `fps`
// (while still counting them for fileCommits/co-change as before), an empty commit message never crashing the
// `toks` computation (a scoping bug the brief calls out explicitly: `toks` must be hoisted out of the `c.msg` guard),
// incremental rebuild producing byte-identical `fps` to a full rebuild on the same final history, and the
// `CFG.fpsCap` truncation keeping the newest entries (dropped from the front).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadHistory } from '../engine/history.mjs';
import { CFG } from '../engine/config.mjs';

let tmp;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' };
const gitIn = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });

before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-fps-')); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
  mkdirSync(join(dir, 'src'), { recursive: true });
}
function commitAll(dir, msg, extraArgs = []) { gitIn(dir, 'add', '-A'); gitIn(dir, 'commit', '-q', ...extraArgs, '-m', msg); }

// 6 commits: add alpha, add beta, change alpha's body (a real structural change — a bare literal edit does not
// move `bh`, which hashes structure/calls/decorators, not literal values), rename beta -> beta module (pure
// rename, no body change), an EMPTY-MESSAGE structural change to alpha again, then a mega-commit (35 new files,
// over CFG.megaCap=30) that must be excluded from `fps` entirely.
function buildSixCommitFixture(dir) {
  initRepo(dir);
  writeFileSync(join(dir, 'src/a.js'), 'export function alpha() { return 1; }\n');
  commitAll(dir, 'add alpha');
  writeFileSync(join(dir, 'src/b.js'), 'export function beta() { return 1; }\n');
  commitAll(dir, 'add beta');
  writeFileSync(join(dir, 'src/a.js'), 'export function alpha() { helper(); return 1; }\n');
  commitAll(dir, 'change alpha');
  gitIn(dir, 'mv', 'src/b.js', 'src/b2.js');
  commitAll(dir, 'rename beta module');
  writeFileSync(join(dir, 'src/a.js'), 'export function alpha() { helper(); helper2(); return 1; }\n');
  commitAll(dir, '', ['--allow-empty-message']);
  for (let i = 0; i < 35; i++) writeFileSync(join(dir, `src/mega${i}.js`), `export function m${i}() { return ${i}; }\n`);
  commitAll(dir, 'mega bulk add');
}

function freshStore(dir) { const store = { dir: join(dir, 'cache'), historyPath: join(dir, 'cache', 'history.json') };
  mkdirSync(store.dir, { recursive: true }); return store; }

test('(a) fps has one entry per non-mega commit, with correct files/scopes/renames; the mega-commit is absent', async () => {
  const gitdir = join(tmp, 'a-repo'); buildSixCommitFixture(gitdir);
  const shas = gitIn(gitdir, 'log', '--format=%H', '--reverse').trim().split('\n');
  assert.equal(shas.length, 6, 'fixture sanity: 6 commits');
  const [shaAlpha, shaBeta, shaChange, shaRename, shaEmpty, shaMega] = shas;

  const { H } = await loadHistory({ gitdir, store: freshStore(join(tmp, 'a-store')), log: () => {} });
  assert.equal(H.fps.length, 5, `mega-commit must be excluded: ${JSON.stringify(H.fps.map(f => f.sha))}`);
  assert.ok(!H.fps.some(fp => fp.sha === shaMega), 'the mega-commit sha must not appear in fps at all');

  const bySha = Object.fromEntries(H.fps.map(fp => [fp.sha, fp]));
  assert.deepEqual(bySha[shaAlpha].files, ['src/a.js']);
  assert.deepEqual(bySha[shaAlpha].scopes, ['src/a.js#method#alpha'], 'a brand-new scope is "born" ⇒ touched');
  assert.deepEqual(bySha[shaAlpha].renames, []);

  assert.deepEqual(bySha[shaBeta].files, ['src/b.js']);
  assert.deepEqual(bySha[shaBeta].scopes, ['src/b.js#method#beta']);

  assert.deepEqual(bySha[shaChange].scopes, ['src/a.js#method#alpha'], 'a structural body change (new call) ⇒ touched');

  assert.deepEqual(bySha[shaRename].files, ['src/b2.js']);
  assert.deepEqual(bySha[shaRename].scopes, [], 'a pure rename (unchanged body) touches nothing');
  assert.deepEqual(bySha[shaRename].renames, [['src/b.js', 'src/b2.js']]);

  assert.deepEqual(bySha[shaEmpty].scopes, ['src/a.js#method#alpha']);
});

test('(b) an empty commit message never crashes fps building — toks is [] for it, not a ReferenceError', async () => {
  const gitdir = join(tmp, 'b-repo'); buildSixCommitFixture(gitdir);
  const shaEmpty = gitIn(gitdir, 'log', '--format=%H', '--reverse').trim().split('\n')[4];

  const { H } = await loadHistory({ gitdir, store: freshStore(join(tmp, 'b-store')), log: () => {} });
  const fp = H.fps.find(f => f.sha === shaEmpty);
  assert.ok(fp, 'the empty-message commit must still get a footprint');
  assert.deepEqual(fp.toks, [], 'no message ⇒ no tokens, but no crash either');
});

test('(c) incremental rebuild produces fps byte-identical (JSON.stringify) to a full rebuild of the same final history', async () => {
  const gitdir = join(tmp, 'c-repo'); buildSixCommitFixture(gitdir);
  const storeIncr = freshStore(join(tmp, 'c-store-incremental'));

  const first = await loadHistory({ gitdir, store: storeIncr, log: () => {} });
  assert.equal(first.mode, 'full');
  assert.equal(first.H.fps.length, 5);

  // a 7th, non-mega commit — so the incremental walk actually contributes a NEW fps entry, not zero
  writeFileSync(join(gitdir, 'src/c.js'), 'export function gamma() { return 1; }\n');
  commitAll(gitdir, 'add gamma');

  const second = await loadHistory({ gitdir, store: storeIncr, log: () => {} });
  assert.equal(second.mode, 'incremental');
  assert.equal(second.H.fps.length, 6, 'the new commit adds exactly one more footprint');

  // a completely fresh full rebuild of the SAME final repo (same commits/shas/timestamps), independent store
  const full = await loadHistory({ gitdir, store: freshStore(join(tmp, 'c-store-full')), log: () => {} });
  assert.equal(full.mode, 'full');
  assert.equal(JSON.stringify(second.H.fps), JSON.stringify(full.H.fps), 'incremental fps must equal full-rebuild fps byte for byte');
});

test('(d) CFG.fpsCap truncates to the newest N entries (dropped from the front) and logs the drop count', async () => {
  const original = CFG.fpsCap;
  try {
    const gitdir = join(tmp, 'd-repo'); initRepo(gitdir);
    writeFileSync(join(gitdir, 'src/a.js'), 'export function alpha() { return 1; }\n'); commitAll(gitdir, 'add alpha');
    writeFileSync(join(gitdir, 'src/b.js'), 'export function beta() { return 1; }\n'); commitAll(gitdir, 'add beta');
    writeFileSync(join(gitdir, 'src/c.js'), 'export function gamma() { return 1; }\n'); commitAll(gitdir, 'add gamma');
    const shas = gitIn(gitdir, 'log', '--format=%H', '--reverse').trim().split('\n');
    assert.equal(shas.length, 3);

    CFG.fpsCap = 2;
    const logs = [];
    const { H } = await loadHistory({ gitdir, store: freshStore(join(tmp, 'd-store')), log: m => logs.push(m) });
    assert.equal(H.fps.length, 2, 'truncated to the cap');
    assert.deepEqual(H.fps.map(fp => fp.sha), [shas[1], shas[2]], 'the OLDEST entry is dropped, the newest two survive');
    assert.ok(logs.some(m => /dropped 1/.test(m)), `expected a log line reporting the dropped count, got: ${JSON.stringify(logs)}`);
  } finally { CFG.fpsCap = original; }
});
