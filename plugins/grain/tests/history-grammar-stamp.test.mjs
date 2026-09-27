// A changed grammar re-parses history (issue 487). The history blob cache and the replay state hold what every
// historical blob parsed to, and a blob parses differently under different grammar bytes, so both are keyed on the
// grammar stamp and the Runes release as well as EXTR_V: a `runes:update` that moves a grammar re-parses the history
// without anyone bumping EXTR_V. The grammars here are the shipped ones, linked into a GRAIN_GRAMMAR_DIR whose own
// manifest.json names their hashes, so moving one hash is exactly "the grammar bytes changed" to every stamp.
// Same technique as runes-pin-reindex.test.mjs: plant a sentinel in the cache, prove it is reused while the stamp
// matches, then change the stamp and prove it is gone.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { removeTemp } from './remove-temp.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const SHIPPED = join(here, '..', 'engine', 'grammars');
const git = (repo, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8' }).trim();
const w = (repo, rel, content) => {
  mkdirSync(join(repo, dirname(rel)), { recursive: true });
  writeFileSync(join(repo, rel), content);
};
const tmps = [];
after(() => {
  for (const d of tmps) removeTemp(d);
});

test('a changed grammar hash re-parses the history instead of reusing the blob cache', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'grain-hist-stamp-'));
  tmps.push(tmp);
  const grammars = join(tmp, 'grammars');
  mkdirSync(grammars);
  for (const f of readdirSync(SHIPPED)) if (f.startsWith('tree-sitter-')) symlinkSync(join(SHIPPED, f), join(grammars, f));
  const manifest = hash => {
    const m = {};
    for (const f of readdirSync(grammars)) if (f.endsWith('.wasm')) m[f.replace(/^tree-sitter-|\.wasm$/g, '')] = { wasmSha256: hash };
    writeFileSync(join(grammars, 'manifest.json'), JSON.stringify(m));
  };
  const refresh = () => {
    const r = spawnSync('node', [BIN, 'refresh'], { cwd: repo, encoding: 'utf8', env: { ...process.env, GRAIN_GRAMMAR_DIR: grammars } });
    assert.equal(r.status, 0, r.stderr);
    return r.stderr;
  };
  const repo = join(tmp, 'r');
  mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main');
  w(repo, 'src/a/Foo.ts', 'export function foo() { return 1; }\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'one');
  manifest('a'.repeat(64));
  refresh();

  const blobs = join(repo, '.grain', 'cache', 'blobs');
  const fooBlob = git(repo, 'rev-parse', 'HEAD:src/a/Foo.ts');
  const shard = join(blobs, fooBlob.slice(0, 3) + '.json');
  const tamper = () => {
    const s = JSON.parse(readFileSync(shard, 'utf8'));
    assert.ok(s[fooBlob], 'fixture sanity: the history parsed Foo.ts into the blob cache');
    s[fooBlob] = ['zqTAMPERED'];
    writeFileSync(shard, JSON.stringify(s));
  };
  tamper();
  w(repo, 'src/b/Bar.ts', 'export const bar = 2;\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'two');
  const same = refresh();
  assert.match(same, /walking [0-9a-f]+\.\.HEAD/, 'NEGATIVE CONTROL: with the stamp matching, the replay resumes');
  assert.ok(readFileSync(shard, 'utf8').includes('zqTAMPERED'), 'NEGATIVE CONTROL: with the stamp matching, the cached blob is reused');

  manifest('b'.repeat(64)); // one `runes:update` later: the same grammars, other bytes
  const moved = refresh();
  assert.match(moved, /walking full history/, 'the replay state from the old grammars is not resumed');
  assert.ok(!readFileSync(shard, 'utf8').includes('zqTAMPERED'), 'a blob parsed under the old grammars is parsed again');
  assert.match(readFileSync(join(blobs, 'VERSION'), 'utf8'), /bbbbbbbb/, 'the blob cache is restamped with the live grammars');
});
