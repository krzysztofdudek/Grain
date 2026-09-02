// J0.2: one renderer for "what does my change still miss" — `missingLines(model, files, { sources })` in core.mjs.
// `review` used to build its own single co-change line straight out of `completenessDirectional`; now it asks
// `missingLines` for BOTH sources (co-change + recipe) and gets back one `missing from your change:` block, silent
// when nothing qualifies. `cochangeData(model, changed)` is the new shared DATA source (same loop, same
// CFG.cochangeMinConf threshold as `completenessDirectional`) — `check-hook` reads it too but keeps its own terse
// rendering; `completeness <file>` keeps calling `completenessDirectional` and must print byte-identical text.
import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const git = (env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const reset = () => { git({}, 'checkout', '-q', 'HEAD', '--', '.'); git({}, 'clean', '-qfd'); };
const handler = (i, body) => `@Handler()\nexport class Handler${i}Handler {\n  run() {\n    return ${body};\n  }\n}\n`;
const CARRIERS = Array.from({ length: 30 }, (_, i) => i); // same scale as review-command.test.mjs — a partition needs enough files/scopes to form at all

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-missing-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git({}, 'init', '-q', '-b', 'main'); git({}, 'config', 'commit.gpgsign', 'false');
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  // an established @Handler() marker with a barrel registrar: index.ts imports all 30 carriers — the same
  // structural shape `whereCmd`'s "a new carrier comes with: registration in ..." already reads via markerImplied
  for (const i of CARRIERS) w(`src/handlers/Handler${i}.ts`, handler(i, i));
  w('src/handlers/index.ts', CARRIERS.map(i => `import { Handler${i}Handler } from './Handler${i}';`).join('\n') +
    `\nexport const handlers = [${CARRIERS.map(i => `Handler${i}Handler`).join(', ')}];\n`);
  git(d1, 'add', '-A'); git(d1, 'commit', '-qm', 'handlers + registrar');
  // a real, directional co-change pair: 9 commits always touching both together — 9/9 clears cochangeMinSup (8) and
  // cochangeMinConf (0.75), same fixture shape as review-command.test.mjs / completeness-hook.test.mjs
  w('src/pair-a.ts', 'export const a = () => 0;\n');
  w('src/pair-b.ts', 'export const b = () => 0;\n');
  git(d1, 'add', '-A'); git(d1, 'commit', '-qm', 'base pair');
  for (let i = 1; i <= 8; i++) { w('src/pair-a.ts', `export const a = () => ${i};\n`); w('src/pair-b.ts', `export const b = () => ${i};\n`); git(d1, 'add', '-A'); git(d1, 'commit', '-qm', `pair change ${i}`); }
  // pushes HEAD's own timestamp forward past freshDays (14) so the @Handler() convention is "established"
  w('NOTES.md', 'notes\n');
  const d2 = dateEnv('2026-03-01T12:00:00Z');
  git(d2, 'add', 'NOTES.md'); git(d2, 'commit', '-qm', 'notes');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' });
  assert.equal(st.status, 0, st.stdout + st.stderr);
  assert.doesNotMatch(st.stdout, /: 0 conventions/, `sanity: the @Handler() convention must be established: ${st.stdout}`);
});
beforeEach(() => reset());
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('a new marker carrier without its registrar touched gets a missing: block with a recipe: line', () => {
  w('src/handlers/Handler30.ts', handler(30, 30)); // untracked new carrier — index.ts NOT touched, no companion file added
  const { out } = grain(['review']);
  assert.match(out, /^missing from your change:$/m, out);
  assert.match(out, /^recipe: .*registered in `src\/handlers\/index\.ts`.*not touched/m, out);
});

test('a co-change partner outside the changed set gets a co-change: line in the missing: block', () => {
  w('src/pair-a.ts', 'export const a = () => 999; // edited\n'); // pair-b.ts not touched
  const { out } = grain(['review']);
  assert.match(out, /^missing from your change:$/m, out);
  assert.match(out, /^co-change: src\/pair-b\.ts \(co-changed in 9\/9 commits\)$/m, out);
});

test('a complete change (no missing co-change, no missing recipe) prints no missing: block at all', () => {
  w('src/handlers/Handler1.ts', handler(1, '1000 // edited, still conforms')); // existing file, conforms, no cochange partner
  const { out } = grain(['review']);
  assert.doesNotMatch(out, /missing from your change:/, out);
  assert.doesNotMatch(out, /^co-change:/m, out);
  assert.doesNotMatch(out, /^recipe:/m, out);
});

test('completeness <file> standalone command keeps its exact, byte-identical text (cochangeData must not change completenessDirectional\'s output)', () => {
  const { out, code } = grain(['completeness', 'src/pair-a.ts']);
  assert.equal(code, 0, out);
  const lines = out.split('\n');
  assert.equal(lines[0], '[grain] Edits like this historically also touch:');
  assert.equal(lines[1], '  - src/pair-b.ts (co-changed in 9/9 commits)');
  assert.match(lines[2], /^as of [0-9a-f]{7}/);
});

// J1.2: single-file `check <file>` gets the same `missing from your change:` block as `review`, but with
// sources: ['cochange'] ONLY — no 'recipe' — since recipe's "is the companion present in the changed set" test
// on a one-file changed set ([rel]) would spuriously fire on almost every new file.
test('J1.2: check <file> on a file with a co-change partner prints a missing from your change: block with a co-change: line', () => {
  w('src/pair-a.ts', 'export const a = () => 999; // edited\n'); // pair-b.ts not touched
  const { out, code } = grain(['check', 'src/pair-a.ts']);
  assert.equal(code, 0, out);
  assert.match(out, /^missing from your change:$/m, out);
  assert.match(out, /^co-change: src\/pair-b\.ts \(co-changed in 9\/9 commits\)$/m, out);
});

test('J1.2: check <file> on a file with no co-change partner prints no missing from your change: block', () => {
  w('src/handlers/Handler1.ts', handler(1, '1000 // edited, still conforms')); // existing file, conforms, no cochange partner
  const { out, code } = grain(['check', 'src/handlers/Handler1.ts']);
  assert.equal(code, 0, out);
  assert.doesNotMatch(out, /missing from your change:/, out);
  assert.doesNotMatch(out, /^co-change:/m, out);
});

test('J1.2: check <file> on a brand-new marker carrier never prints a recipe: line (deliberately cochange-only, unlike review)', () => {
  w('src/handlers/Handler30.ts', handler(30, 30)); // untracked new carrier — index.ts NOT touched, no companion file added
  const { out, code } = grain(['check', 'src/handlers/Handler30.ts']);
  assert.equal(code, 0, out);
  assert.doesNotMatch(out, /^recipe:/m, out);
  // contrast: the same file via `review` DOES get a recipe: line (locked in above) — proves this is a deliberate
  // scoping difference for single-file `check`, not an accidental omission
});

test('J1.2: check <file> --json output shape is unchanged (no cochangePartners or other review-only keys) — updated for §089\'s additive `disclosures[]`', () => {
  const { out, code } = grain(['check', 'src/pair-a.ts', '--json']);
  assert.equal(code, 0, out);
  const j = JSON.parse(out);
  // §089 added one new, additive key (`disclosures`, always present — [] when nothing is disclosed): every other
  // key this test locked in stays exactly as it was, and `cochangePartners` (a review-only key) still must not leak
  assert.deepEqual(Object.keys(j).sort(), ['architecture', 'asOf', 'deviationsInChange', 'deviationsPreExisting', 'dirty', 'disclosures', 'file', 'governed', 'hasError', 'label', 'partition', 'placement', 'schema', 'scopes', 'steers', 'waivers'].sort());
  assert.ok(!('cochangePartners' in j));
});
