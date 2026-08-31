// G13 — deepening a shallow clone (`git fetch --unshallow`) never invalidates the index.
// `isShallow` is checked only inside `loadHistory`, at the moment history is first walked; the result freezes
// into meta.historyMode/historyReason and `ensureFresh`'s freshness check never re-examines shallowness. So a
// repo cloned shallow, then deepened without HEAD moving, is stuck reporting "history: none (shallow clone…)"
// forever, even though `git rev-parse --is-shallow-repository` now says false and full history sits in the repo.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');

let tmp;
const grain = (args, opts = {}) => { const r = spawnSync('node', [BIN, ...args], { cwd: opts.cwd, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const buildFixture = dir => execFileSync('node', [BUILDER, dir], { stdio: 'pipe' });
const isShallow = dir => execFileSync('git', ['-C', dir, 'rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim();
const readMeta = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'meta.json'), 'utf8'));
const convCount = json => json.partitions.reduce((a, p) => a + p.conventions, 0);
const SHALLOW_REASON = 'shallow clone — history unavailable, weights flat';

before(() => { tmp = mkdtempSync(join(tmpdir(), 'grain-shallow-')); });
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('unshallowing a clone (same HEAD) invalidates the index and recovers full history', () => {
  const origin = join(tmp, 'origin'); buildFixture(origin);
  const repo = join(tmp, 'shallow-copy');
  execFileSync('git', ['clone', '--depth', '1', `file://${origin}`, repo], { stdio: 'pipe' });
  assert.equal(isShallow(repo), 'true', 'fixture sanity: the clone must actually be shallow');

  const first = JSON.parse(grain(['status', '--json'], { cwd: repo }).out);
  assert.equal(first.history, null);
  assert.equal(convCount(first), 0, 'no established conventions can be spoken without history');
  const meta1 = readMeta(repo);
  assert.equal(meta1.historyMode, 'none');
  assert.equal(meta1.historyReason, SHALLOW_REASON);

  // regression control: querying a REPO THAT STAYS SHALLOW twice must never trigger a rebuild
  const second = JSON.parse(grain(['status', '--json'], { cwd: repo }).out);
  assert.equal(convCount(second), 0);
  const meta2 = readMeta(repo);
  assert.equal(meta2.builtAt, meta1.builtAt, 'a still-shallow repo queried again must not rebuild');

  execFileSync('git', ['-C', repo, 'fetch', '--unshallow'], { stdio: 'pipe' });
  assert.equal(isShallow(repo), 'false', 'fixture sanity: the repo must actually be unshallow now');
  assert.equal(execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), meta1.headSha, 'HEAD must not have moved — only depth changed');

  const third = JSON.parse(grain(['status', '--json'], { cwd: repo }).out);
  const meta3 = readMeta(repo);
  assert.notEqual(meta3.builtAt, meta1.builtAt, `today: red — unshallowing at the same HEAD must trigger a real rebuild, builtAt stuck at ${meta1.builtAt}`);
  assert.notEqual(meta3.historyMode, 'none', `today: red — history must no longer be 'none' once the repo is deepened, got ${JSON.stringify(meta3.historyMode)}`);
  assert.equal(meta3.historyReason, null);
  assert.ok(convCount(third) > 0, `today: red — full history must recover established conventions, got ${convCount(third)}`);
});
