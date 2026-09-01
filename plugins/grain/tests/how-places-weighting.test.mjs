// 005 — `how`'s "places such a change touched" is a flat union across every matched commit: a place touched by a
// 0.9-score commit and a place touched by a 0.35-score commit both land in the list with equal footing, sorted
// only by raw commit count (`k`) then alphabetically. Two real repos hit this: `how "fix IPv6 address parsing"`
// (flask) buried the two real IPv6 commits' files under a 26-file "use ruff linter" match, and `how "add a new
// translation locale"` (spring-petclinic) buried the two real i18n files under an unrelated jodatime-migration
// match. THIS IS NOT a matcher problem (howEval's J2.3 gate already measures the matcher itself, untouched here):
// the AGGREGATION step downstream of the match discards the per-match `score` the matcher already computed.
//
// Fixture (a): one STRONG commit ("alpha bravo …", carries every query token → score 1.0) and one WEAK commit
// ("alpha only …", carries one of two query tokens → score ~0.398, still above the 0.34 weak-match floor)
// touching DISJOINT file sets — the weak commit's files are named to sort ALPHABETICALLY BEFORE the strong
// commit's files (`src/aaa/...` vs `src/zzz/...`), so the old k-then-alpha sort visibly gets this backwards: it
// would rank the weak match's files first. `k`/`of` are identical (1/2) for every place here on purpose — that is
// exactly why k-then-alpha ordering cannot tell strong from weak apart, and a weight derived from the match score
// can.
//
// Fixture (b): a how-hook scenario (two full-score matches sharing one file, k=2) — a regression guard that
// `how-hook`'s existing `places.filter(p => p.k >= 2)` (grain.mjs) still filters correctly once places are ranked
// by weight: `k`'s own value and meaning are untouched by this fix, only the ORDER of the places array changes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { howCmd } from '../engine/core.mjs';
import { readHistoryState } from '../engine/history.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');

const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', TZ: 'UTC' };
const gitIn = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });
const grain = (args, cwd) => { const r = spawnSync('node', [BIN, ...args], { cwd, encoding: 'utf8' });
  return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const w = (dir, rel, content) => { const p = join(dir, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };

const T0 = Date.UTC(2026, 0, 5, 12, 0, 0);
let day = 0;
function commit(dir, msg) { day += 3; const d = new Date(T0 + day * 86400000).toISOString();
  gitIn(dir, 'add', '-A');
  execFileSync('git', ['-C', dir, 'commit', '-q', '-m', msg], { encoding: 'utf8', env: { ...process.env, ...gitEnv, GIT_AUTHOR_DATE: d, GIT_COMMITTER_DATE: d } }); }
const shaOf = (dir, subject) => gitIn(dir, 'log', '--format=%H%x1f%s').trim().split('\n').map(l => l.split('\x1f')).find(([, s]) => s === subject)?.[0];

let tmp, disjointRepo, sharedRepo;

// (a) disjoint fixture: baseline (no query tokens) · strong (carries both "alpha"+"bravo" → score 1.0) · weak
// (carries only "alpha" → score ~0.398). Disjoint file sets, weak's sorting alphabetically first.
function buildDisjoint(dir) {
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
  w(dir, 'src/core/base.ts', `export class Base { id = ''; }\n`);
  commit(dir, 'init project');

  w(dir, 'src/zzz/strong1.ts', `export class StrongOne { run(): number { return 1; } }\n`);
  w(dir, 'src/zzz/strong2.ts', `export class StrongTwo { run(): number { return 2; } }\n`);
  commit(dir, 'alpha bravo rollout');

  w(dir, 'src/aaa/weak1.ts', `export class WeakOne { run(): number { return 3; } }\n`);
  w(dir, 'src/aaa/weak2.ts', `export class WeakTwo { run(): number { return 4; } }\n`);
  commit(dir, 'alpha only tweak');
}

// (b) shared-file fixture for how-hook's k>=2 filter: two full-score matches share one file (k=2), each also
// touches one file of its own (k=1) — the k>=2 filter must still admit exactly the shared file.
function buildShared(dir) {
  mkdirSync(dir, { recursive: true });
  gitIn(dir, 'init', '-q', '-b', 'main');
  gitIn(dir, 'config', 'commit.gpgsign', 'false');
  w(dir, 'src/core/base.ts', `export class Base { id = ''; }\n`);
  commit(dir, 'init project');

  w(dir, 'src/shared/thing.ts', `export class Thing { a(): number { return 1; } }\n`);
  w(dir, 'src/onlyx/onlyx-file.ts', `export class OnlyX { b(): number { return 2; } }\n`);
  commit(dir, 'gamma delta feature one');

  w(dir, 'src/shared/thing.ts', `export class Thing { a(): number { return 1; } b(): number { return 2; } }\n`);
  w(dir, 'src/onlyy/onlyy-file.ts', `export class OnlyY { c(): number { return 3; } }\n`);
  commit(dir, 'gamma delta feature two');
}

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-how-places-'));
  disjointRepo = join(tmp, 'disjoint'); day = 0; buildDisjoint(disjointRepo);
  sharedRepo = join(tmp, 'shared'); day = 0; buildShared(sharedRepo);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('(1) the strong match\'s files rank above the weak match\'s disjoint files, despite sorting alphabetically after them', () => {
  const j = JSON.parse(grain(['how', 'alpha bravo', '--json'], disjointRepo).out);
  assert.equal(j.matches.length, 2, `expected exactly 2 matches (strong+weak): ${JSON.stringify(j.matches)}`);
  assert.equal(j.places.length, 4, `expected 4 disjoint places (2 strong + 2 weak): ${JSON.stringify(j.places)}`);

  // every place here is 1/2 — k alone genuinely cannot distinguish strong from weak
  for (const p of j.places) { assert.equal(p.k, 1); assert.equal(p.of, 2); }

  const rels = j.places.map(p => p.rel);
  assert.deepEqual(rels.slice(0, 2).sort(), ['src/zzz/strong1.ts', 'src/zzz/strong2.ts'],
    `the strong match's files must rank first, got order: ${JSON.stringify(rels)}`);
  assert.deepEqual(rels.slice(2).sort(), ['src/aaa/weak1.ts', 'src/aaa/weak2.ts'],
    `the weak match's files must rank last, got order: ${JSON.stringify(rels)}`);

  // the plain-text rendering must reflect the same order: the first place line names a strong-match file
  const text = grain(['how', 'alpha bravo'], disjointRepo).out;
  const lines = text.split('\n');
  const hdr = lines.indexOf('places such a change touched:');
  assert.ok(hdr >= 0, `expected the places header, got:\n${text}`);
  assert.match(lines[hdr + 1], /src\/zzz\/strong[12]\.ts/, `the first rendered place must be a strong-match file, got:\n${text}`);
  assert.doesNotMatch(lines[hdr + 1], /src\/aaa\/weak/, `a weak-match file must not lead the rendered list, got:\n${text}`);
});

test('(2) guard: the matcher itself is unchanged — same matches[], same shas, same scores', async () => {
  // `how --json`'s own CLI projection drops `score` (grain.mjs cmdHow), so this reads howCmd's real return value
  // directly, over the model+history the CLI run above already built in the fixture's cache — the same inputs
  // `cmdHow`/`how-hook` themselves pass it.
  const model = JSON.parse(readFileSync(join(disjointRepo, '.grain', 'cache', 'model.json'), 'utf8'));
  const history = await readHistoryState(join(disjointRepo, '.grain', 'cache', 'history.json'));
  const { matches } = howCmd({ model, H: { fps: history.fps || [] }, query: 'alpha bravo', top: 5 });
  const strongSha = shaOf(disjointRepo, 'alpha bravo rollout');
  const weakSha = shaOf(disjointRepo, 'alpha only tweak');
  assert.deepEqual(matches.map(m => ({ sha: m.sha, score: m.score })), [
    { sha: strongSha, score: 1 },
    { sha: weakSha, score: 0.398 },
  ], `aggregation changed the MATCH set/scores, not just the places downstream of it: ${JSON.stringify(matches)}`);
});

test('(3) how-hook\'s `p.k >= 2` filter still admits a genuinely shared place, and excludes the k=1 ones', () => {
  const st = spawnSync('node', [BIN, 'status'], { cwd: sharedRepo, encoding: 'utf8' });
  assert.equal(st.status, 0, st.stderr);
  const r = spawnSync('node', [BIN, 'how-hook'], { cwd: sharedRepo, encoding: 'utf8',
    input: JSON.stringify({ cwd: sharedRepo, hook_event_name: 'UserPromptSubmit', prompt: 'gamma delta', prompt_source: 'user_input' }) });
  assert.equal(r.status, 0, r.stderr);
  const out = (r.stdout || '').trim();
  assert.ok(out, 'expected the hook to speak: two full-score matches must clear the `strong` gate');
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  assert.match(ctx, /places such a change touched:/, `expected a places block, got:\n${ctx}`);
  assert.match(ctx, /src\/shared\/thing\.ts \(2\/2\)/, `the k=2 shared place must still be admitted, got:\n${ctx}`);
  assert.doesNotMatch(ctx, /onlyx-file|onlyy-file/, `a k=1 place must still be excluded by the >= 2 filter, got:\n${ctx}`);
});
