// A moved Runes pin re-indexes. Relation facts are the output of the vendored Runes extractors and ride the tree cache
// (.grain/cache/tree.json) beside the scopes, so `runes:update` is an extraction change: the index stamp records the
// pinned tag and commit (meta.json "runes"), and a store stamped under another Runes must not reuse its tree cache.
// Same technique as cross-check-cache-invalidation.test.mjs: plant a sentinel in the cache, prove it is consulted
// while the stamp matches, then make the recorded stamp another Runes and prove the sentinel is gone and the stamp
// is the live one again.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runesStamp } from '../engine/grain-context.mjs';
import { removeTemp } from './remove-temp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const PIN = JSON.parse(readFileSync(join(here, '..', 'engine', 'vendor', 'runes.pin.json'), 'utf8'));
const git = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim();
const w = (repo, rel, content) => {
  mkdirSync(join(repo, dirname(rel)), { recursive: true });
  writeFileSync(join(repo, rel), content);
};
const refresh = repo => {
  const r = spawnSync('node', [BIN, 'refresh'], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
};
const readJ = p => JSON.parse(readFileSync(p, 'utf8'));
const tmps = [];
after(() => {
  for (const d of tmps) removeTemp(d);
});

test('the index stamp names the pinned Runes tag and commit', () => {
  assert.equal(runesStamp(), `${PIN.tag}@${PIN.commit.slice(0, 12)}`);
});

test('a store stamped under another Runes re-extracts instead of reusing its tree cache', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'grain-runes-stamp-'));
  tmps.push(tmp);
  const repo = join(tmp, 'r');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  w(repo, 'src/a/Foo.ts', "import { Bar } from '../b/Bar';\nexport function foo() { return new Bar(); }\n");
  w(repo, 'src/b/Bar.ts', 'export class Bar {}\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'one');
  refresh(repo);
  const treePath = join(repo, '.grain', 'cache', 'tree.json');
  const metaPath = join(repo, '.grain', 'cache', 'meta.json');
  assert.equal(readJ(metaPath).runes, runesStamp(), 'the store records the live Runes stamp');
  const tree = readJ(treePath);
  const key = Object.keys(tree).find(k => k.endsWith('|src/a/Foo.ts'));
  assert.ok(key && tree[key].r && tree[key].r.u.length, 'fixture sanity: Foo.ts carries cached relation facts');
  tree[key].r.u[0].kind = 'zqTAMPERED';
  writeFileSync(treePath, JSON.stringify(tree));

  // HEAD moves without touching Foo.ts's blob, so only the cache can supply its facts
  w(repo, 'src/c/Baz.ts', 'export const baz = 1;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'two');
  refresh(repo);
  assert.ok(readFileSync(treePath, 'utf8').includes('zqTAMPERED'), 'NEGATIVE CONTROL: with the stamp matching, the cached facts are reused');

  const meta = readJ(metaPath);
  meta.runes = 'v0.0.0@000000000000'; // the store as another Runes release left it
  writeFileSync(metaPath, JSON.stringify(meta));
  refresh(repo);
  assert.ok(!readFileSync(treePath, 'utf8').includes('zqTAMPERED'), 'a store from another Runes must re-extract every file');
  assert.equal(readJ(metaPath).runes, runesStamp(), 'the re-index restamps the live Runes');
});
