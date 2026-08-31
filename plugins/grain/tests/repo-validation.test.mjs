// A nonexistent `--repo` path must fail clean, not get silently fabricated on disk (mkdir -p + a fresh .grain/cache/*)
// with an exit-0 "0 files" answer. Only an EXPLICIT --repo that resolves to a path that does not exist is rejected —
// an existing directory that merely isn't a git repo keeps the documented no-git degradation, unchanged.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

let tmp;
const grain = (args, opts = {}) => { const r = spawnSync('node', [BIN, ...args], { cwd: opts.cwd || tmp, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };

before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-repo-validation-')); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('status --repo <nonexistent nested path>: fails clean and fabricates nothing on disk', () => {
  const bad = join(tmp, 'nope', 'deeper', 'still-not-there');
  assert.equal(existsSync(bad), false);
  const { code, err } = grain(['status', '--repo', bad]);
  assert.notEqual(code, 0, `expected a non-zero exit, got 0 with stderr: ${err}`);
  assert.match(err, /no such directory/);
  assert.equal(existsSync(bad), false, 'a bad --repo must not fabricate a directory tree on disk');
});

test('where --repo <nonexistent path>: the same validation applies to other findRoot-driven commands', () => {
  const bad = join(tmp, 'also-not-there');
  const { code, err } = grain(['where', 'guard', '--repo', bad]);
  assert.notEqual(code, 0, `expected a non-zero exit, got 0 with stderr: ${err}`);
  assert.match(err, /no such directory/);
  assert.equal(existsSync(bad), false, 'a bad --repo must not fabricate a directory tree on disk');
});

test('an EXISTING non-git directory used via --repo keeps the documented no-git degradation (regression control)', () => {
  const plain = join(tmp, 'plain-existing'); mkdirSync(plain);
  const { code, out, err } = grain(['status', '--repo', plain]);
  assert.equal(code, 0, err);
  assert.match(out, /as of no-git$/);
});
