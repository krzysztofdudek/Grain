// CROSS-CHECK — THE INCREMENTAL EQUIVALENCE INVARIANT: an incrementally-updated model must be indistinguishable
// from a from-scratch build at the SAME HEAD, on every surface. Every query auto-refreshes incrementally
// (engine/history.mjs's blob cache + replay state, core.mjs's treeCache); `grain refresh --full` is the only way
// to force a full rebuild. If incremental refresh ever disagreed with a from-scratch rebuild, every downstream
// answer would silently depend on the order in which the user happened to run commands — that is the bug class
// this file exists to catch.
//
// GENERALIZES, DOES NOT DUPLICATE: tests/scope-cochange.test.mjs's (b4) already checks ONE data structure
// (`H.scopeCochange`) across ONE small, controlled diff (2 extra co-touching commits). This file checks EVERY
// user-facing read surface (where/how/what/check/report/map/status/rules) AND the whole persisted `model.json`,
// across a longer, messier walk that also crosses a file rename and a file deletion — and, unlike that file, adds
// a determinism CONTROL (two from-scratch builds of the same commit, compared to each other) so that any RED
// below is provably an incremental-path bug and not ordinary fixture/engine nondeterminism.
//
// FIXTURE: reuses the shared tests/fixtures/build-fixture.mjs (154 files; the same builder
// tests/shallow-unshallow.test.mjs already uses as prior art for cache-state manipulation between runs), plus 3
// appended commits carrying the 3 incremental history shapes this file targets: a `git mv` rename mid-history, a
// file deletion mid-history, and a file added in the LAST commit. WHY THE SHARED BUILDER AND NOT A HAND-ROLLED
// 8-12-FILE FIXTURE: tried first, empirically — a hand-rolled fixture of up to 25 decorated handler/service pairs
// (50 files, every member a near-identical clone) certified ZERO domain conventions no matter how large ("grain
// status" kept reporting "0 conventions"). That is the same wall tests/spectrum-role-deviation.test.mjs's own
// header documents ("induceRoles's own clustering does not reliably split a role this small/uniform ... 0
// accepted role-conditioned facts") — MDL's codelength gate needs real cross-cutting variation, which a fixture of
// uniform clones never supplies, however many of them there are. build-fixture.mjs's 29-noun, 4-kind-file wave
// pattern reliably certifies ~83 conventions (verified while building this file) — required so
// where/how/what/check/report/map/status have real content to (dis)agree about, not just placement noise.
//
// THE 3 VOLATILE FIELDS EXCLUDED BELOW — every one found by actually diffing two real from-scratch builds of the
// same commit (not assumed), each with a comment at its point of use justifying the exclusion:
//   (1) meta.builtAt / meta.buildMs — the wall-clock build timestamp+duration, printed by status/report's
//       freshnessLines as "built <ISO> in <N>ms". Real time-of-build, never a repo fact — engine/grain.mjs stamps
//       it fresh on every rebuild (`builtAt: new Date().toISOString()`).
//   (2) meta.historyMode as rendered in that SAME freshnessLines line ("history <mode>") — reports HOW the
//       currently-cached model was assembled (full rebuild vs. incremental resume vs. unchanged). This is exactly
//       the ONE axis this whole file deliberately varies between the two sides of every comparison below (that is
//       the entire point of the test), so it is EXPECTED to differ and excluding it is not a discharge of anything
//       — it is the axis under test being told apart from its own effects.
//   (3) rulesMarkdown's `date` parameter (`rules`'s "on <date>" stamp) defaults to `new Date()` — real wall clock.
//       It never actually differed in this file's own runs (both sides of every comparison execute within the
//       same real second), but is pinned/normalized anyway per instruction: "didn't flip today" is not the same
//       guarantee as "cannot flip" on a slow machine or across a midnight boundary.
//   `model.json` itself needed ZERO exclusions — verified by an unmodified `assert.deepEqual` below, which is the
//   honest result of actually running this, not an assumption: engine/core.mjs's own `learn()` deliberately keeps
//   `model.historyStats` to `{ commits, events, blobs }` and drops "parsed/cached/mb" specifically BECAUSE those
//   run diagnostics "would break byte-identity across cache states" (see that field's own comment in core.mjs) —
//   model.json was built to be cache-state-independent from the start, and this file confirms that promise holds.
//
// VERSION CHURN DURING THIS RUN: other agents are concurrently editing engine/** in this session (per the task
// briefing, one is adding a `.properties` grammar — EXTR_V g27→g28 was observed to flip mid-development of this
// very file). `grain version` is recorded at file-load time and again in the final `after` hook, and once more
// immediately before/after the incremental walk itself so a mid-walk flip forcing an unwanted full rebuild is
// distinguishable from a genuine incremental-path bug (see the "[walk sanity]" tests below). g28's own changelog
// entry says it only changes extraction for `.properties` files, which this fixture has none of — confirmed
// irrelevant here, not merely assumed.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = join(here, '..', 'bin', 'grain.mjs');
const BUILDER = join(here, '..', '..', '..', 'tests', 'fixtures', 'build-fixture.mjs');

const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const gitIn = (repo, env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const wIn = (repo, rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grainIn = (repo, args) => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr || '', code: r.status }; };
const grainVersion = () => (spawnSync('node', [BIN, 'version'], { encoding: 'utf8' }).stdout || '').trim();

const versionAtStart = grainVersion();

// build-fixture.mjs's own history (16 commits, 2024-01..2024-06) + 3 appended commits (2025-01-01..03) carrying
// the incremental history shapes this file targets. Returns the full, ordered commit sha list plus the 3 new
// shas by name, so callers never have to guess indices into the SHARED builder's own commit count.
function buildFixture(dir) {
  execFileSync('node', [BUILDER, dir], { stdio: 'pipe' });

  // (a) RENAME mid-history: a real `git mv`, content untouched (same minimal-rename shape
  // tests/scope-cochange.test.mjs's own (b3) test uses) — src/handlers/catalog.* moves into a subdirectory.
  mkdirSync(join(dir, 'src/handlers/legacy'), { recursive: true });
  gitIn(dir, {}, 'mv', 'src/handlers/catalog.handler.ts', 'src/handlers/legacy/catalog.handler.ts');
  gitIn(dir, dateEnv('2025-01-01T12:00:00Z'), 'commit', '-q', '-m', 'rename: catalog handler moved into legacy/');

  // (b) DELETION mid-history: one file's whole history ends here; HEAD moves on without it.
  gitIn(dir, {}, 'rm', '-q', 'src/dto/ticket.dto.ts');
  gitIn(dir, dateEnv('2025-01-02T12:00:00Z'), 'commit', '-q', '-m', 'remove: ticket.dto.ts (dead code)');

  // (c) ADDITION in the LAST commit: a brand-new handler+service pair, born the instant before HEAD is read —
  // the shape an incremental replay must birth correctly on the very first refresh that ever sees it.
  wIn(dir, 'src/handlers/onboarding.handler.ts', `import { Handler, validate, type Command } from '../core/handler';\nimport { OnboardingService } from '../services/onboarding.service';\n\nexport interface CreateOnboardingCommand extends Command { readonly onboardingId: string; }\n\n@Handler()\nexport class CreateOnboardingHandler {\n  constructor(private readonly service: OnboardingService) {}\n\n  async handle(cmd: CreateOnboardingCommand): Promise<void> {\n    validate(cmd);\n    const entity = await this.service.load(cmd.onboardingId);\n    await this.service.apply(entity, 'create');\n  }\n}\n`);
  wIn(dir, 'src/services/onboarding.service.ts', `import { Injectable, BaseService } from '../core/service';\n\n@Injectable()\nexport class OnboardingService extends BaseService {\n  async load(id: string): Promise<{ id: string }> {\n    this.logger.info('load onboarding ' + id);\n    return { id };\n  }\n\n  async apply(entity: { id: string }, action: string): Promise<void> {\n    this.logger.info('apply ' + action + ' to ' + entity.id);\n  }\n}\n`);
  const d3 = dateEnv('2025-01-03T12:00:00Z');
  gitIn(dir, d3, 'add', '-A'); gitIn(dir, d3, 'commit', '-q', '-m', 'feat: onboarding (added in last commit)');

  const shas = gitIn(dir, {}, 'log', '--format=%H', '--reverse').split('\n').filter(Boolean);
  return { dir, shas, renameSha: shas[shas.length - 3], deleteSha: shas[shas.length - 2], addLastSha: shas[shas.length - 1] };
}

// the 8 read surfaces named in this file's brief, in that order — real query words/paths that exist in the
// fixture (verified non-empty by hand while building this file: where/how/what/check all return real hits, not
// "nothing found"; report/status/map/rules all render the ~83-convention model, not an empty-model banner).
const CMDS = [
  { name: 'where', args: ['where', 'handler'] },
  { name: 'how', args: ['how', 'add handler'] },
  { name: 'what', args: ['what', 'order'] },
  { name: 'check', args: ['check', 'src/handlers/order.handler.ts'] },
  { name: 'report', args: ['report'] },
  { name: 'map', args: ['map'] },
  { name: 'status', args: ['status'] },
  { name: 'rules', args: ['rules'] },
];

// see the header's "THE 3 VOLATILE FIELDS" note for what each replacement is and why it is legitimate.
const normalize = (name, text) => {
  let t = text;
  if (name === 'status' || name === 'report') {
    t = t.replace(/built \S+ in \d+ms/, 'built <BUILT_AT> in <BUILD_MS>ms'); // (1) meta.builtAt/buildMs
    t = t.replace(/\bhistory (full|incremental|unchanged|none)\b/, 'history <MODE>'); // (2) meta.historyMode — the axis under test
  }
  if (name === 'rules') t = t.replace(/on \d{4}-\d{2}-\d{2} —/, 'on <DATE> —'); // (3) rulesMarkdown's wall-clock date param
  return t;
};

function captureAll(repo) {
  const out = {};
  for (const c of CMDS) {
    const r = grainIn(repo, c.args);
    assert.equal(r.code, 0, `grain ${c.args.join(' ')} exited ${r.code}: ${r.err}`);
    out[c.name] = { raw: r.out, norm: normalize(c.name, r.out) };
  }
  return out;
}
const readModel = repo => JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));

// ===================================================================================================
// STEP 2 — BASELINE DETERMINISM CONTROL: two from-scratch builds of the SAME commit, compared to each
// other. No incremental path is involved anywhere in this section — it exists solely so that a RED in the
// property section below (STEP 3/4) can be read as "the incremental path disagrees with a fresh build" and
// not "grain is nondeterministic in general, incremental or not."
// ===================================================================================================
let ctlTmp, ctlRepo, ctlBuild1, ctlModel1, ctlBuild2, ctlModel2;
before(() => {
  ctlTmp = mkdtempSync(join(tmpdir(), 'grain-xcheck-ctl-'));
  ctlRepo = join(ctlTmp, 'r');
  buildFixture(ctlRepo);
  ctlBuild1 = captureAll(ctlRepo);
  ctlModel1 = readModel(ctlRepo);
  rmSync(join(ctlRepo, '.grain'), { recursive: true, force: true });
  ctlBuild2 = captureAll(ctlRepo);
  ctlModel2 = readModel(ctlRepo);
});
after(() => { if (ctlTmp) rmSync(ctlTmp, { recursive: true, force: true }); });

for (const c of CMDS) {
  test(`[control] two from-scratch builds at the same HEAD produce byte-identical \`grain ${c.name}\` (modulo the named volatile fields)`, () => {
    assert.equal(ctlBuild2[c.name].norm, ctlBuild1[c.name].norm,
      `grain ${c.args.join(' ')} differed between two from-scratch builds of the SAME commit — this would be a general grain nondeterminism bug (no incremental path is involved here at all), not the incremental-path property this file targets.\n--- build 1 ---\n${ctlBuild1[c.name].raw}\n--- build 2 ---\n${ctlBuild2[c.name].raw}`);
  });
}
test('[control] model.json is byte-identical (deep-equal) between two from-scratch builds at the same HEAD', () => {
  assert.deepEqual(ctlModel2, ctlModel1, 'model.json differed between two from-scratch builds of the same commit — a general grain nondeterminism bug');
});

// ===================================================================================================
// STEP 3 + 4 — THE PROPERTY: cold-build at an earlier commit K, then advance one commit at a time to HEAD
// via the ORDINARY auto-refresh (`grain status` after each commit), vs. a from-scratch build at the final
// HEAD. K is chosen as HEAD~5 (not just HEAD~2) so the walk crosses 2 ordinary commits from the shared
// builder's own history FIRST, then all 3 of this file's appended shapes — the rename, the deletion, and the
// last-commit addition — all on the INCREMENTAL side. That satisfies step 4 in the same pass as step 3 (its
// own dedicated "[walk sanity]" tests below confirm the rename and deletion commits specifically were each
// crossed incrementally, not folded into a hidden full rebuild).
// ===================================================================================================
let walkTmp, walkRepo, walkShas, renameSha, deleteSha, kIndex, kSha, walkStepModes, versionBeforeWalk, versionAfterWalk;
let incrCapture, incrModel, coldCapture, coldModel;
before(() => {
  walkTmp = mkdtempSync(join(tmpdir(), 'grain-xcheck-walk-'));
  walkRepo = join(walkTmp, 'r');
  const built = buildFixture(walkRepo);
  walkShas = built.shas; renameSha = built.renameSha; deleteSha = built.deleteSha;

  kIndex = walkShas.length - 1 - 5;
  assert.ok(kIndex >= 0, `fixture sanity: need at least 6 commits, got ${walkShas.length}`);
  kSha = walkShas[kIndex];
  gitIn(walkRepo, {}, 'checkout', '-q', '--detach', kSha);

  versionBeforeWalk = grainVersion();
  const cold0 = grainIn(walkRepo, ['status']);
  assert.equal(cold0.code, 0, cold0.err);
  assert.match(cold0.err, /\(full history\)/, `cold build at K (${kSha}) must be a full rebuild — got:\n${cold0.err}`);

  walkStepModes = [];
  for (let i = kIndex + 1; i < walkShas.length; i++) {
    gitIn(walkRepo, {}, 'checkout', '-q', '--detach', walkShas[i]);
    const r = grainIn(walkRepo, ['status']); // the "cheap command" — ordinary auto-refresh does the incremental update
    assert.equal(r.code, 0, r.err);
    walkStepModes.push({ sha: walkShas[i], incremental: /\(incremental\)/.test(r.err), err: r.err });
  }
  versionAfterWalk = grainVersion();

  incrCapture = captureAll(walkRepo);
  incrModel = readModel(walkRepo);
  rmSync(join(walkRepo, '.grain'), { recursive: true, force: true });
  coldCapture = captureAll(walkRepo);
  coldModel = readModel(walkRepo);
});
after(() => { if (walkTmp) rmSync(walkTmp, { recursive: true, force: true }); });

test('[walk sanity] every step past the cold build at K actually took the INCREMENTAL path, not a hidden full rebuild', () => {
  const full = walkStepModes.filter(s => !s.incremental);
  assert.deepEqual(full.map(s => s.sha), [],
    `${full.length} of ${walkStepModes.length} step(s) silently fell back to a full rebuild instead of incremental — ` +
    (versionBeforeWalk !== versionAfterWalk
      ? `grain's own version changed mid-walk (${versionBeforeWalk} -> ${versionAfterWalk}, likely another agent's concurrent engine/ edit invalidating versionOk) — this is very likely environmental contamination, not a grain bug; re-run this file. `
      : `grain's version was stable throughout the walk (${versionBeforeWalk}), so a stray version bump does NOT explain this. `) +
    `Full-mode commit(s): ${JSON.stringify(full)}`);
});
test('[walk sanity] the RENAME commit specifically was walked incrementally (req. #4)', () => {
  const step = walkStepModes.find(s => s.sha === renameSha);
  assert.ok(step, 'fixture sanity: the rename commit must be part of the walked range');
  assert.ok(step.incremental, `the rename commit must be crossed by the INCREMENTAL path, not folded into a full rebuild:\n${step.err}`);
});
test('[walk sanity] the DELETION commit specifically was walked incrementally (req. #4)', () => {
  const step = walkStepModes.find(s => s.sha === deleteSha);
  assert.ok(step, 'fixture sanity: the deletion commit must be part of the walked range');
  assert.ok(step.incremental, `the deletion commit must be crossed by the INCREMENTAL path, not folded into a full rebuild:\n${step.err}`);
});

for (const c of CMDS) {
  test(`[property] \`grain ${c.name}\` after an incremental walk to HEAD is byte-identical to a from-scratch build at the same HEAD (modulo the named volatile fields)`, () => {
    assert.equal(incrCapture[c.name].norm, coldCapture[c.name].norm,
      `grain ${c.args.join(' ')} disagreed: incremental-walk-to-HEAD vs. from-scratch-build-at-HEAD. This is exactly what this file exists to catch — see the header for the [control] section's proof that this is not ordinary fixture/engine nondeterminism.\n--- incremental ---\n${incrCapture[c.name].raw}\n--- from scratch ---\n${coldCapture[c.name].raw}`);
  });
}
test('[property] model.json is byte-identical (deep-equal) between an incremental walk to HEAD and a from-scratch build at the same HEAD', () => {
  assert.deepEqual(incrModel, coldModel,
    'model.json differs between the incrementally-updated model and a from-scratch rebuild at the same HEAD — a real incremental-path bug (the [control] tests above prove this is not general nondeterminism)');
});

after(() => {
  const versionAtEnd = grainVersion();
  console.log(`[xcheck] grain version at file start: ${versionAtStart}`);
  console.log(`[xcheck] grain version at file end:   ${versionAtEnd}`);
  if (versionAtEnd !== versionAtStart) console.log('[xcheck] NOTE: grain version changed during this file\'s run (another agent\'s concurrent engine/ edit) — see individual test failure messages for whether this contaminated any result.');
});
