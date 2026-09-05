// Cross-check: `grain propose`'s TEXT report and its `--json <path>` document must not disagree about the same
// facts — the same invariant `tests/cross-check-json-text.test.mjs` states for every other `--json` command
// ("text may say MORE, JSON may carry more structure, but a fact present in both must match, and a load-bearing
// fact in one must not be silently missing from the other").
//
// `propose` differs from the commands that file covers in ONE way: its `--json` names a FILE rather than
// replacing stdout, because a maintainer wants the report on screen and the numbers on disk from the same run.
// That makes the invariant stronger here, not weaker — both renderings come out of one invocation, so any
// disagreement is a real disagreement and never a difference between two runs. `proposeReport` builds them in a
// single pass for exactly that reason; this file is the guard that keeps it that way.
//
// The fixture is the repository's own deterministic one (`tests/fixtures/build-fixture.mjs`) — a real on-disk
// project with a real, date-pinned git history, never fabricated data. On a smaller repository the aspect
// assertions below would pass vacuously, which is the one way a parity test can lie: this fixture drafts tens of
// aspects and earns at least one enforcement, so the id-for-id and number-for-number comparisons have something
// to compare.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');
const YG_BIN = process.env.YG_BIN || '/home/user/Yggdrasil/source/cli/dist/bin.js';

let tmp, repo, text, json;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'propose-parity-'));
  repo = join(tmp, 'fixture');
  execFileSync('node', [BUILDER, repo], { stdio: 'pipe' });
  const r = spawnSync('node', [BIN, 'propose', '--json', join(tmp, 'report.json')], {
    cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28, env: { ...process.env, YG_BIN },
  });
  assert.equal(r.status, 0, r.stderr);
  text = r.stdout;
  json = JSON.parse(readFileSync(join(tmp, 'report.json'), 'utf8'));
  assert.ok(json.aspects.total > 10, `fixture sanity: expected the parity comparisons to have aspects to compare, got ${json.aspects.total}`);
});
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

test('the JSON is one document with a stable schema key and the paths it names exist', () => {
  assert.equal(json.schema, 'grain-propose/1');
  assert.ok(existsSync(join(repo, json.paths.proposal)), `paths.proposal does not exist: ${json.paths.proposal}`);
  assert.ok(existsSync(join(repo, json.paths.evidence)), `paths.evidence does not exist: ${json.paths.evidence}`);
  assert.ok(existsSync(join(repo, json.architecture.path)), `architecture.path does not exist: ${json.architecture.path}`);
  assert.ok(existsSync(join(repo, json.paths.graph)), `paths.graph does not exist: ${json.paths.graph}`);
});

test('every architecture number in the text is the number in the JSON', () => {
  const arch = text.split('\n').find(l => l.startsWith('architecture:'));
  assert.ok(arch, `no architecture line:\n${text}`);
  const nums = [...arch.matchAll(/(\d+) (node types|nodes|relations|dependency cycle)/g)].reduce((a, m) => ({ ...a, [m[2]]: +m[1] }), {});
  assert.equal(nums['node types'], json.architecture.nodeTypes);
  assert.equal(nums['nodes'], json.architecture.nodes);
  assert.equal(nums['relations'], json.architecture.relations);
  assert.equal(nums['dependency cycle'], json.architecture.cycles);
  assert.ok(arch.endsWith(json.architecture.path), `the text must name the same path the JSON does: ${arch}`);
});

test('the enforced and candidate counts, and the aspect ids under them, are the same on both sides', () => {
  const enf = text.split('\n').find(l => l.startsWith('enforced:'));
  const cand = text.split('\n').find(l => l.startsWith('candidates:'));
  assert.ok(enf && cand, `missing an enforced/candidates line:\n${text}`);
  assert.match(enf, new RegExp(`^enforced: ${json.aspects.enforced} of ${json.aspects.total} aspects`));
  assert.match(cand, new RegExp(`^candidates: ${json.aspects.candidates} of ${json.aspects.total}`));
  // an aspect id never contains a space, so the first token of an indented line is the id, whatever prose follows
  const named = [...text.matchAll(/^ {2}(\S+) — /gm)].map(m => m[1]);
  assert.deepEqual(named, [...json.enforced, ...json.candidates].map(a => a.id),
    'the ids the text names, in order, must be exactly the ids the JSON lists, in order');
});

test('every aspect the text names carries the drill numbers and the statement the JSON carries for it', () => {
  for (const a of [...json.enforced, ...json.candidates]) {
    const idx = text.split('\n').findIndex(l => l === `  ${a.id} — ${a.statement}`);
    assert.ok(idx >= 0, `the text does not name ${a.id} with the JSON's own statement`);
    const detail = text.split('\n')[idx + 1];
    assert.match(detail, new RegExp(`caught ${a.drill.caught} of ${a.drill.planted}`), detail);
    assert.match(detail, new RegExp(`${a.drill.falseAlarms} false alarm`), detail);
    assert.equal(detail.trim().endsWith(a.path), true, `the text must name the JSON's own path: ${detail}`);
  }
});

test('what stayed on disk is counted identically in both, and the two partitions add up to the whole', () => {
  const rest = text.split('\n').find(l => l.startsWith('on disk, not above:'));
  assert.ok(rest, `no on-disk summary line:\n${text}`);
  assert.match(rest, new RegExp(`^on disk, not above: ${json.aspects.rest} more draft`));
  assert.match(rest, new RegExp(`${json.alternatives} finer type alternative`));
  assert.match(rest, new RegExp(`${json.skippedNotARule} convention\\(s\\) skipped as not a rule`));
  for (const [reason, n] of Object.entries(json.aspects.restByDraftReason)) assert.match(rest, new RegExp(`${n} ${reason}`));
  assert.equal(json.aspects.enforced + json.aspects.candidates + json.aspects.rest, json.aspects.total,
    'enforced + candidates + rest must be every aspect the run drafted — no aspect may be invisible in both renderings');
  const sidecar = JSON.parse(readFileSync(join(repo, json.paths.evidence), 'utf8'));
  assert.equal(json.aspects.total, sidecar.counts.aspects, 'the report and the proposal it describes must count the same aspects');
});
