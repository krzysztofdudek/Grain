// §087 — `BlobCache`'s shard width, and the I/O amplification it controls.
//
// `parseBlobs` walks blobs in batches of 400 and calls `flush()` after each one, and `flush()` evicts every shard
// it writes so the parsed scope records of a whole blob history are never all live at once (removing that eviction
// was measured to OOM: Symfony's walk finished all 211,065 blobs and then died in `replay` with "Ineffective
// mark-compacts near heap limit" at a 4.08 GB heap). Eviction means the NEXT batch re-reads every shard it
// touches — so how many shards there are decides how much of the cache each batch has to move.
//
// At the original 2-hex width there were 256 shards, and a 400-blob batch touched essentially all of them: every
// batch re-read, re-parsed, re-serialized and rewrote the entire cache. Measured on Symfony (528 batches, 1986 s
// cold build): `shard` 296.8 s inclusive + `flush` 233.7 s inclusive = 530 s, 26.7 % of the build, spent moving
// bytes that had just been written. A 3-hex width makes 4096 shards, so a batch touches a thin slice instead.
//
// Test (a) is the red→green: it pins that a batch of blobs spreads across many shards rather than piling into a
// handful, which is the whole property the width buys. (b)-(f) pin the behaviour that must NOT change.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BlobCache } from '../engine/history.mjs';

let tmp;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-blobcache-'));
});
after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const scopes = n => [{ kind: 'function', name: 'fn' + n, line: n }];
// deterministic, evenly-spread 40-hex blob shas, the shape git hands `parseBlobs`
const HEX = '0123456789abcdef';
function blobSha(i) {
  let h = '',
    x = (i * 2654435761) >>> 0;
  for (let j = 0; j < 40; j++) {
    x = (x * 1664525 + 1013904223) >>> 0;
    h += HEX[(x >>> 24) & 15];
  }
  return h;
}

test('(a) red→green: one 400-blob batch spreads across hundreds of shards, so a flush moves a thin slice of the cache', () => {
  const dir = join(tmp, 'a');
  const cache = new BlobCache(dir);
  const BATCH = 400; // parseBlobs' own batch size
  for (let i = 0; i < BATCH; i++) cache.set(blobSha(i), scopes(i));
  cache.flush();

  const shardFiles = readdirSync(dir).filter(f => f.endsWith('.json'));
  // At the old 2-hex width this was ~250 of a possible 256 — i.e. the whole cache — and every later batch had to
  // re-read all of it. At 3 hex the same 400 blobs land in ~390 of a possible 4096, under a tenth of the space.
  assert.ok(
    shardFiles.length > BATCH * 0.75,
    `a 400-blob batch must spread over hundreds of shards, got ${shardFiles.length}`
  );
  const possible = 16 ** (shardFiles[0].length - 5);
  assert.ok(possible >= 4096, `the shard space must be at least 4096 wide, got ${possible}`);
  assert.ok(
    shardFiles.length / possible < 0.15,
    `one batch must dirty a small fraction of the shard space, got ${shardFiles.length}/${possible}`
  );

  for (let i = 0; i < BATCH; i++) assert.deepEqual(cache.get(blobSha(i)), scopes(i), `entry ${i} readable after flush`);
});

// (b)-(f) must hold at ANY shard width — they pin behaviour, not the constant, so they read the width back off
// the cache rather than assuming it.
const shardFileOf = dir => readdirSync(dir).filter(f => f.endsWith('.json'))[0];

test('(b) flush writes every dirty shard and evicts it — durability kept, live heap bounded', () => {
  const dir = join(tmp, 'b');
  const cache = new BlobCache(dir);
  const s = blobSha(1);
  cache.set(s, scopes(1));
  cache.flush();

  assert.equal(cache.shards.size, 0, 'flush must evict what it wrote — this is the memory bound, not an accident');
  const f = shardFileOf(dir);
  assert.ok(f && s.startsWith(f.slice(0, -5)), 'the shard reached disk, named by the sha prefix');
  assert.deepEqual(JSON.parse(readFileSync(join(dir, f), 'utf8'))[s], scopes(1), 'with its entry intact');
  assert.deepEqual(cache.get(s), scopes(1), 'and is read back from disk on demand');
});

test('(c) entries added across several flushes accumulate in their shard, on disk and on reopen', () => {
  const dir = join(tmp, 'c');
  const cache = new BlobCache(dir);
  // shas sharing their first 8 hex chars land in one shard at any width <= 8, so this exercises accumulation
  // rather than spreading, whatever the width happens to be
  const same = i => 'abcdef01' + blobSha(i).slice(8);
  for (let i = 1; i <= 5; i++) {
    cache.set(same(i), scopes(i));
    cache.flush(); // one flush per "batch", as parseBlobs does
  }
  assert.equal(readdirSync(dir).filter(f => f.endsWith('.json')).length, 1, 'all five shared one shard');
  const onDisk = JSON.parse(readFileSync(join(dir, shardFileOf(dir)), 'utf8'));
  assert.equal(Object.keys(onDisk).length, 5, 'every entry survived the repeated flush/evict cycles');

  const reopened = new BlobCache(dir);
  for (let i = 1; i <= 5; i++) assert.deepEqual(reopened.get(same(i)), scopes(i), `entry ${i} after reopen`);
});

test('(d) a pre-existing cache is recognised, so a resumed walk skips blobs instead of re-parsing them', () => {
  const dir = join(tmp, 'd');
  const first = new BlobCache(dir);
  for (let i = 0; i < 20; i++) first.set(blobSha(i), scopes(i));
  first.flush();

  // parseBlobs opens with `!cache.has(sha)` over every candidate blob — that filter is what must see the cache
  const second = new BlobCache(dir);
  for (let i = 0; i < 20; i++) assert.equal(second.has(blobSha(i)), true, `blob ${i} is recognised as cached`);
  assert.equal(second.has(blobSha(999)), false, 'an uncached blob is still reported missing');
});

test('(e) a cache written at a different shard width is dropped rather than left orphaned', () => {
  const dir = join(tmp, 'e');
  const cache = new BlobCache(dir);
  cache.set(blobSha(3), scopes(3));
  cache.flush();
  const width = shardFileOf(dir).length - '.json'.length;

  // an old-format shard file, as a store built at a different width would have left behind
  const legacy = join(dir, 'abcdef'.slice(0, width === 2 ? 3 : 2) + '.json');
  writeFileSync(legacy, JSON.stringify({ deadbeef: [] }));
  assert.ok(existsSync(legacy), 'precondition: a wrong-width shard file exists');

  const reopened = new BlobCache(dir);
  assert.equal(existsSync(legacy), false, 'the wrong-width file is removed on open');
  assert.deepEqual(reopened.get(blobSha(3)), scopes(3), 'while correctly-sharded entries are untouched');
});

test('(f) an extractor-version change still invalidates the whole cache', () => {
  const dir = join(tmp, 'f');
  const cache = new BlobCache(dir);
  cache.set(blobSha(5), scopes(5));
  cache.flush();
  assert.ok(readdirSync(dir).some(f => f.endsWith('.json')));

  writeFileSync(join(dir, 'VERSION'), 'not-the-current-extractor\n');
  const reopened = new BlobCache(dir);
  assert.equal(readdirSync(dir).some(f => f.endsWith('.json')), false, 'a stale-extractor cache is wiped on open');
  assert.equal(reopened.has(blobSha(5)), false, 'and nothing survives it');
});
