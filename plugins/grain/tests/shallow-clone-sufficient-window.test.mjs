// §054a — the shallow-clone history gate used to key on the git-reported BOOLEAN `is-shallow-repository` flag
// alone, regardless of how much history that flag's clone actually carries. `loadHistory` returned `H: null`
// for ANY shallow clone, which forces core.mjs's per-scope survival check (`ageFn` defaults to a constant-zero
// function when `H` is null) to be unsatisfiable for every single cell in the repository — including cells that
// had already cleared `bits > 0` and the λ/MDL acceptance bound on pure structural evidence. Measured on Symfony:
// this blanket veto was the entire cause of `"conventions": []` — forcing survival unconditionally recovered
// 1,446 conventions from 14,674 wrongly-killed cells.
//
// The fix: a shallow clone's visible window (HEAD's timestamp minus the oldest commit `git log` can still see)
// is compared against `CFG.freshDays` — the exact same threshold the survival gate itself requires per scope.
// If the visible window is narrower than one `freshDays` span, NO scope in the repo could ever clear the
// survival bound regardless of how history is loaded, so failing closed (H: null, same message as before) is
// still correct. But once the window is at least `freshDays` wide, walking the available (if left-truncated)
// history is safe — `git log` simply stops at the shallow boundary, no network, no crawl — and gives every
// scope touched within that window a real lower-bound age, which is exactly what the survival check needs.
//
// This test proves both halves: a `--depth 1` clone (window ~0 days) still fails closed exactly as before, and
// a `--depth 4` clone of the SAME fixture (window ~27 days, comfortably over the fixture's freshDays=14 bound)
// must no longer be zeroed out just because git also calls it "shallow".
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

let tmp, origin;
const grain = (args, opts = {}) => {
  const r = spawnSync('node', [BIN, ...args], { cwd: opts.cwd, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status };
};
const isShallow = dir =>
  execFileSync('git', ['-C', dir, 'rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim();
const readMeta = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'meta.json'), 'utf8'));
const convCount = json => json.partitions.reduce((a, p) => a + p.conventions, 0);
const SHALLOW_REASON = 'shallow clone — history unavailable, weights flat';

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-shallow-window-'));
  origin = join(tmp, 'origin');
  execFileSync('node', [BUILDER, origin], { stdio: 'pipe' });
});
after(() => {
  rmSync(tmp, { recursive: true, force: true });
});

test('a shallow clone whose visible window is narrower than freshDays still fails closed (genuine lack of history)', () => {
  const repo = join(tmp, 'shallow-depth1');
  execFileSync('git', ['clone', '--depth', '1', `file://${origin}`, repo], { stdio: 'pipe' });
  assert.equal(isShallow(repo), 'true', 'fixture sanity: the clone must actually be shallow');

  const result = JSON.parse(grain(['status', '--json'], { cwd: repo }).out);
  assert.equal(result.history, null);
  assert.equal(convCount(result), 0, 'depth 1 gives a ~0-day window — no scope can clear the freshDays survival bound');
  const meta = readMeta(repo);
  assert.equal(meta.historyMode, 'none');
  assert.equal(meta.historyReason, SHALLOW_REASON);
});

test('a shallow clone whose visible window covers at least freshDays must NOT be zeroed out just because git calls it shallow', () => {
  const repo = join(tmp, 'shallow-depth4');
  execFileSync('git', ['clone', '--depth', '4', `file://${origin}`, repo], { stdio: 'pipe' });
  assert.equal(isShallow(repo), 'true', 'fixture sanity: the clone must actually be shallow');

  // NB: `-1` limits the traversal BEFORE `--reverse` reorders it, so `log --reverse -1` would return the NEWEST
  // commit, not the oldest — take the first line of the full reversed list instead (bounded by this clone's depth).
  const oldestTs = +execFileSync('git', ['-C', repo, 'log', '--reverse', '--format=%ct'], { encoding: 'utf8' }).split('\n', 1)[0];
  const headTs = +execFileSync('git', ['-C', repo, 'log', '-1', '--format=%ct', 'HEAD'], { encoding: 'utf8' }).trim();
  const windowDays = (headTs - oldestTs) / 86400;
  assert.ok(windowDays >= 14, `fixture sanity: this depth must expose a window ≥ freshDays, got ${windowDays} days`);

  const result = JSON.parse(grain(['status', '--json'], { cwd: repo }).out);
  const meta = readMeta(repo);
  assert.notEqual(
    meta.historyReason,
    SHALLOW_REASON,
    `today: red — a ${windowDays}-day window is enough history for the survival gate, the clone being "shallow" must not veto it`
  );
  assert.ok(
    convCount(result) > 0,
    `today: red — cells that already cleared bits>0 and the λ bound must survive once the window covers freshDays, got ${convCount(result)} conventions`
  );

  // sanity ceiling: it must still be an honest partial history, not silently treated as a full clone forever —
  // deepening further remains meaningful (covered by shallow-unshallow.test.mjs's G13 contract), this test only
  // asserts the window-sufficient case is no longer wrongly vetoed.
  assert.equal(meta.historyMode, 'full');
});
