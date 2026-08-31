// G2: BlobCache never evicted a shard once touched (this.shards grew for the whole walk) and parseBlobs flushed
// exactly ONCE, after its entire chunked loop (400 blobs/chunk) finished — so on a large repository peak memory grew
// unboundedly across the whole history, and a crash anywhere before the loop's last chunk lost every parsed blob,
// forcing a retry to redo the identical, doomed work from scratch.
//
// Fix under test: flush() now evicts each shard from `this.shards` right after writing it (bounding memory to
// "shards touched since the last flush"), and parseBlobs flushes at the END OF EVERY CHUNK instead of once at the
// end — so a crash partway through chunk N still leaves chunks 1..N-1 durable on disk.
//
// This test injects a failure inside chunk 2 (call #450, i.e. the 50th blob of the second 400-blob chunk) via a
// BlobCache subclass whose set() throws once a call counter reaches that threshold. Before the fix: the crash loses
// chunk 1's work too (single post-loop flush never ran). After the fix: chunk 1 is already durable on disk when
// chunk 2 crashes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlobCache, parseBlobs } from '../engine/history.mjs';

const N = 800; // ≥ 2 chunks of parseBlobs' 400-per-chunk loop
let tmp, gitdir, blobExt, firstSha;

const gitIn = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], {
  encoding: 'utf8',
  env: { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' },
});

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-blobcache-'));
  gitdir = join(tmp, 'repo');
  mkdirSync(gitdir, { recursive: true });
  gitIn(gitdir, 'init', '-q', '-b', 'main');
  gitIn(gitdir, 'config', 'commit.gpgsign', 'false');
  for (let i = 0; i < N; i++) writeFileSync(join(gitdir, `f${i}.js`), `export const f${i} = ${i};\n`);
  gitIn(gitdir, 'add', '-A');
  gitIn(gitdir, 'commit', '-qm', `add ${N} distinct source files`);

  // build blobExt the same way the real walk() would: sha -> extension, in git ls-tree's (deterministic) order
  blobExt = new Map();
  for (const line of gitIn(gitdir, 'ls-tree', '-r', 'HEAD').split('\n')) {
    const m = line.match(/^\d+ blob ([0-9a-f]+)\t(.+)\.js$/);
    if (m) blobExt.set(m[1], '.js');
  }
  assert.equal(blobExt.size, N, 'fixture sanity: one distinct blob per file');
  firstSha = [...blobExt.keys()][0]; // definitely in chunk 1 (blobs 0..399)
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

class FailingBlobCache extends BlobCache {
  constructor(dir, failAt) { super(dir); this.calls = 0; this.failAt = failAt; }
  // parseBlobs' own try/catch treats a thrown set() as a parse failure and immediately retries with
  // `cache.set(sha, [])` in the catch handler (uncaught by any try there) — so the injection must keep
  // failing from failAt onward, not just once, or that retry silently swallows it.
  set(sha, sc) { this.calls++; if (this.calls >= this.failAt) throw new Error('injected failure'); super.set(sha, sc); }
}

test('a crash inside chunk 2 still leaves chunk 1 durable on disk (fresh cache read)', async () => {
  const cacheDir = join(tmp, 'cache-crash', 'blobs');
  const cache = new FailingBlobCache(cacheDir, 450); // 450 > 400: inside chunk 2, after chunk 1 fully processed

  await assert.rejects(() => parseBlobs(gitdir, cache, blobExt, () => {}), /injected failure/);

  const fresh = new BlobCache(cacheDir); // forces a real disk read, not the crashed instance's in-memory state
  assert.ok(fresh.has(firstSha), 'chunk 1 (fully processed before the chunk-2 crash) must already be flushed to disk');
});

test('a plain run with no injected failure fully succeeds — the eviction does not lose or corrupt anything', async () => {
  const cacheDir = join(tmp, 'cache-happy', 'blobs');
  const cache = new BlobCache(cacheDir);

  const { parsed, total } = await parseBlobs(gitdir, cache, blobExt, () => {});
  assert.equal(total, N);
  assert.equal(parsed, N, 'every blob is valid, distinct .js content — all must parse successfully');

  const fresh = new BlobCache(cacheDir);
  for (const sha of blobExt.keys()) assert.ok(fresh.has(sha), `blob ${sha} must be cached on disk`);
});
