// Issue 409: the suite's git runs with background maintenance off (tests/git-env.mjs, loaded before every test
// file). Without it, git 2.55 packs a fixture's objects in a detached `git maintenance run --auto` while the fixture
// is still being committed, and a `git add` racing the pack fails with "unable to create temporary file". This
// guards that the setting reaches a test's git — including one run with HOME pointed at a temporary directory, as
// most fixture builders here do, where no global config is read at all.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('every git the suite runs has background maintenance and auto gc turned off, even with HOME elsewhere (issue 409)', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'git-env-'));
  try {
    const env = { ...process.env, HOME: tmp };
    execFileSync('git', ['init', '-q', tmp], { env });
    const get = key => execFileSync('git', ['-C', tmp, 'config', '--get', key], { env, encoding: 'utf8' }).trim();
    assert.equal(get('maintenance.auto'), 'false', 'run the suite through `npm test`, or `node --import ./tests/git-env.mjs --test …`');
    assert.equal(get('gc.auto'), '0');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
