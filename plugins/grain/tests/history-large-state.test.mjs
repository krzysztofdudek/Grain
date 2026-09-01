// §055 — a full-history walk on a Symfony-scale repo (82,946 commits) completed correctly and then died silently:
// `atomicWrite(store.historyPath, JSON.stringify(state))` built the ENTIRE replay state (one entry per distinct
// blob/pair/path ever seen across the whole history) as a single JS string, past V8's own hard string-length cap
// — measured (§054 D3): `RangeError: Invalid string length` at `history.mjs:270`, and the only thing a user ever
// saw was the bare, undiagnostic line `[grain] Invalid string length` — no indication the walk itself had
// succeeded, no indication of what to do next.
//
// Reproducing an 82,946-commit repo in a unit test is impractical, so this file proves both required halves at
// the serialization boundary instead (`writeHistoryState`/`readHistoryState`, the two functions §055 introduced):
//   (1) no single `JSON.stringify` call `loadHistory`'s persistence path makes is allowed to grow with the total
//       size of the history state — it is bounded by the size of ONE record, however many records there are.
//   (2) a failure at that boundary (a corrupt/legacy save file on read, an unwritable path on write) is never
//       swallowed: it is logged through the same `[grain]`-prefixed channel every other diagnostic uses, and a
//       write-side failure never costs the caller the answer it already computed in memory.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadHistory, freshState, writeHistoryState, readHistoryState } from '../engine/history.mjs';

let tmp;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' };
const gitIn = (repo, ...a) =>
  execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-hist-large-'));
});
after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

function initRepo(dir) {
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
}
function commitAll(dir, msg) {
  gitIn(dir, 'add', '-A');
  gitIn(dir, 'commit', '-q', '-m', msg);
}
function freshStore(dir) {
  const store = { dir: join(dir, 'cache'), historyPath: join(dir, 'cache', 'history.json') };
  mkdirSync(store.dir, { recursive: true });
  return store;
}

test('(1) writeHistoryState never calls JSON.stringify on more than one record, however large the total state is', async () => {
  // 300,000 synthetic co-change-support entries: a monolithic `JSON.stringify(state)` over this alone is already
  // tens of MB in one string — at Symfony's real scale (millions of such entries, §054) the equivalent call is
  // exactly what threw `RangeError: Invalid string length`. Every entry here is the same small shape real
  // `pairSup`/`fileCommits` entries are (§13.5) — the fix must stay correct at this shape regardless of count.
  const state = freshState();
  for (let i = 0; i < 300000; i++) state.pairSup[`src/file${i}.jssrc/other${i}.js`] = i % 50;
  for (let i = 0; i < 50000; i++) state.blobShas['b'.repeat(30) + String(i).padStart(10, '0')] = 1;
  state.lastSha = 'deadbeef';
  state.commits = 12345;

  const path = join(tmp, 'synthetic-history.json');
  const origStringify = JSON.stringify;
  let maxLen = 0,
    calls = 0;
  JSON.stringify = (...args) => {
    const s = origStringify(...args);
    calls++;
    if (s.length > maxLen) maxLen = s.length;
    return s;
  };
  try {
    await writeHistoryState(path, state);
  } finally {
    JSON.stringify = origStringify;
  }
  assert.ok(calls > 300000, `expected one JSON.stringify call per record (~350000+), got ${calls}`);
  // one record ("src/fileNNNNNN.jssrc/otherNNNNNN.js", count) tagged as ["m","pairSup",key,value] is well
  // under a few hundred bytes; a monolithic write would instead make ONE call whose length is the size of the
  // whole state (tens of millions of characters at this fixture's scale, and past V8's cap at Symfony's).
  assert.ok(maxLen < 2000, `no single JSON.stringify call should exceed one record's size, got ${maxLen} chars`);

  // and it must still round-trip losslessly through readHistoryState
  const back = await readHistoryState(path);
  assert.equal(back.lastSha, 'deadbeef');
  assert.equal(back.commits, 12345);
  assert.equal(Object.keys(back.pairSup).length, 300000);
  assert.equal(back.pairSup['src/file42.jssrc/other42.js'], 42 % 50);
  assert.equal(Object.keys(back.blobShas).length, 50000);
});

test('(2) a saved history file that fails to read is a loud [history] diagnostic, not a silent full re-walk', async () => {
  const gitdir = join(tmp, 'read-fail-repo');
  initRepo(gitdir);
  writeFileSync(join(gitdir, 'a.js'), 'export function a() { return 1; }\n');
  commitAll(gitdir, 'add a');

  const store = freshStore(join(tmp, 'read-fail-store'));
  const first = await loadHistory({ gitdir, store, log: () => {} });
  assert.equal(first.mode, 'full');
  assert.ok(existsSync(store.historyPath), 'a history file must have been saved');

  // corrupt it as a pre-migration single-JSON-object save would look: valid JSON, but not an array-of-rows
  // (readHistoryState's own defence: array-destructuring a plain object throws, correctly rejecting the old shape)
  writeFileSync(store.historyPath, JSON.stringify({ x: 'not', h: 'a', row: 'shape' }) + '\n');

  const logs = [];
  const second = await loadHistory({ gitdir, store, log: m => logs.push(String(m)) });
  assert.equal(second.mode, 'full', 'an unreadable save falls back to a full walk, not a crash');
  assert.ok(second.H, 'a usable H must still come back');
  assert.ok(
    logs.some(m => /history state unreadable/.test(m)),
    `expected a [history] diagnostic naming the read failure, got: ${JSON.stringify(logs)}`
  );
});

test('(3) a history file that fails to SAVE still returns this run\'s fully-computed answer, loudly, not silently', async () => {
  const gitdir = join(tmp, 'write-fail-repo');
  initRepo(gitdir);
  writeFileSync(join(gitdir, 'a.js'), 'export function a() { return 1; }\n');
  commitAll(gitdir, 'add a');
  writeFileSync(join(gitdir, 'b.js'), 'export function b() { return 1; }\n');
  commitAll(gitdir, 'add b');

  const store = freshStore(join(tmp, 'write-fail-store'));
  // point the save path inside a directory that does not exist, so writeHistoryState's createWriteStream fails
  // (ENOENT) — a real, unmocked OS-level failure at the exact boundary a save error (disk full, permissions, a
  // store directory removed mid-run, …) would hit, and platform-independent (unlike e.g. making the destination
  // itself a directory, which some filesystems tolerate opening for write until the first actual write).
  store.historyPath = join(store.dir, 'missing-subdir', 'history.json');

  const logs = [];
  const { H, mode } = await loadHistory({ gitdir, store, log: m => logs.push(String(m)) });
  assert.equal(mode, 'full');
  assert.equal(H.fps.length, 2, 'the walk itself must still have completed and be usable, save failure notwithstanding');
  assert.ok(
    logs.some(m => /could not save history state/.test(m)),
    `expected a [history] diagnostic naming the save failure, got: ${JSON.stringify(logs)}`
  );
});
