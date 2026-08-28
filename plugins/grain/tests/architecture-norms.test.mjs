// Established layering norms: grain already MEASURES the module dependency graph (moduleGraph, computeArchHits'
// first-crossing/cycle branches) but never ran that measurement through the same acceptance mathematics as every
// other convention — so it could say a cycle exists, but never that "this one import departs from the established
// practice of its own module" when 14 of 15 files in a module correctly avoid a dependency and one outlier doesn't.
//
// architectureNorms(model) (core.mjs) treats a (source module, target module) pair as a cell exactly like a
// `_all`-scoped predicate cell in mine() (§9.4a, mathematics.md): counts = { true: files in A reaching B, false:
// files in A that don't }, neff = |files in A|, decided with the IDENTICAL kt()/CFG.lambda posterior-predictive test
// as mine()'s isAll branch — no new constant. computeArchHits (the fourth branch, where `if (fwd) continue;` used to
// give up unconditionally the moment ANY historical forward edge existed) now consults it: an established forward
// edge stays silent as before UNLESS the edited file is itself the counted exception to its own module's norm.
//
// Part 1 hand-builds `model.filesAll`/`model.edges`/`model.pkgs` directly (architectureNorms needs nothing else) to
// pin down the exact acceptance math. Part 2 is a real git-backed fixture exercising `grain check`'s wiring end to
// end, since computeArchHits needs real parsed relation facts (model.relDecls) to resolve an edited file's imports.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { architectureNorms } from '../engine/core.mjs';

// ===== Part 1: the acceptance math, on hand-built models =====

test('architectureNorms accepts a false norm for a module whose one outlier file departs, when a sibling module\'s accepted practice is to reach the same target', () => {
  const files = [];
  for (let i = 0; i < 15; i++) files.push(`A/${i}.ts`);
  for (let i = 0; i < 15; i++) files.push(`C/${i}.ts`);
  files.push('B/idx.ts');
  const edges = [{ from: 'A/0.ts', to: 'B/idx.ts' }];
  for (let i = 0; i < 15; i++) edges.push({ from: `C/${i}.ts`, to: 'B/idx.ts' });
  const norms = architectureNorms({ filesAll: files, edges, pkgs: [] });

  const ab = norms.find(n => n.from === 'A' && n.to === 'B');
  assert.ok(ab, `expected an accepted norm for A→B: ${JSON.stringify(norms)}`);
  assert.equal(ab.exp, 'false'); assert.equal(ab.ne, 14); assert.equal(ab.neff, 15); assert.ok(ab.bits > 0, `bits=${ab.bits}`);

  const cb = norms.find(n => n.from === 'C' && n.to === 'B');
  assert.ok(cb, `expected an accepted norm for C→B: ${JSON.stringify(norms)}`);
  assert.equal(cb.exp, 'true'); assert.equal(cb.ne, 15); assert.equal(cb.neff, 15);
});

test('architectureNorms rejects a pair below the raw/eff floor even with a sibling true norm present', () => {
  const files = []; for (let i = 0; i < 15; i++) files.push(`C/${i}.ts`); // sibling: an accepted true norm to B
  files.push('B/idx.ts');
  for (let i = 0; i < 4; i++) files.push(`D/${i}.ts`); // D: only 4 files total — below CFG.minRaw (5)
  const edges = []; for (let i = 0; i < 15; i++) edges.push({ from: `C/${i}.ts`, to: 'B/idx.ts' });
  edges.push({ from: 'D/0.ts', to: 'B/idx.ts' });
  const norms = architectureNorms({ filesAll: files, edges, pkgs: [] });

  assert.ok(!norms.find(n => n.from === 'D'), `D→B must stay silent (raw=4 < CFG.minRaw): ${JSON.stringify(norms)}`);
  assert.ok(norms.find(n => n.from === 'C' && n.exp === 'true'), 'sanity: C→B is still accepted');
});

test('architectureNorms accepts a false norm via the outside-share fallback when no single sibling module clears its own floor', () => {
  const files = []; for (let i = 0; i < 15; i++) files.push(`A/${i}.ts`); files.push('B/idx.ts');
  const edges = [{ from: 'A/0.ts', to: 'B/idx.ts' }];
  for (let m = 0; m < 5; m++) { for (let i = 0; i < 3; i++) files.push(`D${m}/${i}.ts`); edges.push({ from: `D${m}/0.ts`, to: 'B/idx.ts' }); }
  const norms = architectureNorms({ filesAll: files, edges, pkgs: [] });

  assert.ok(!norms.some(n => n.exp === 'true'), `sanity: no module individually clears the floor to reach B: ${JSON.stringify(norms)}`);
  const ab = norms.find(n => n.from === 'A' && n.to === 'B');
  assert.ok(ab, `expected A→B accepted via the outside-share fallback (5 of 16 files outside A reach B = 31%): ${JSON.stringify(norms)}`);
  assert.equal(ab.exp, 'false');
});

test('architectureNorms withholds a false norm when reaching the target is not a demonstrated live option anywhere else', () => {
  const files = []; for (let i = 0; i < 15; i++) files.push(`A/${i}.ts`); files.push('B/idx.ts');
  const edges = [{ from: 'A/0.ts', to: 'B/idx.ts' }]; // positive bits and posterior pass on their own — but nobody else ever reaches B
  const norms = architectureNorms({ filesAll: files, edges, pkgs: [] });
  assert.ok(!norms.find(n => n.from === 'A' && n.to === 'B'), `A→B must stay silent — the absence-boundary condition fails: ${JSON.stringify(norms)}`);
});

// ===== Part 2: wiring into `check`, on a real git-backed fixture =====

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, ...gitEnv } }).trim();
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-archnorms-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
  w('packages/target/util.ts', 'export const util = () => 1;\n');
  // consumer: 15 files, ALL reach target — the established, majority practice for this module
  for (let i = 0; i < 15; i++) w(`packages/consumer/C${i}.ts`, `import { util } from '../target/util';\nexport const c${i} = () => util();\n`);
  // outlier: 15 files, 14 never reach target — Reach.ts is the one exception
  for (let i = 0; i < 14; i++) w(`packages/outlier/O${i}.ts`, `export const o${i} = () => ${i};\n`);
  w('packages/outlier/Reach.ts', "import { util } from '../target/util';\nexport const reach = () => util();\n");
  // small: only 4 files total — below CFG.minRaw/minEff, so its own (small → target) pair stays silent regardless
  for (let i = 0; i < 3; i++) w(`packages/small/S${i}.ts`, `export const s${i} = () => ${i};\n`);
  w('packages/small/SmallReach.ts', "import { util } from '../target/util';\nexport const smallReach = () => util();\n");
  // newmod: untouched by anyone — used to exercise the pre-existing first-crossing branch
  w('packages/newmod/util2.ts', 'export const util2 = () => 2;\n');
  git('add', '-A'); git('commit', '-qm', 'base');
  const r = grain(['status']); assert.equal(r.code, 0, r.err);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('an outlier import that departs from its own module\'s established practice is flagged with counts', () => {
  // Reach.ts's import must already be in the committed graph for `fwd` to exist (the case this branch fires on), so
  // unlike the first-crossing/cycle fixtures below it is not itself an uncommitted edit — `--all` surfaces it exactly
  // like the existing `(N architecture note(s) on lines you did not touch — --all shows)` pre-existing path already does.
  const c = grain(['check', 'packages/outlier/Reach.ts', '--all']);
  assert.match(c.out, /\[grain\] architecture: your import of `packages\/target\/util\.ts` \(line 1\) reaches packages\/target — packages\/outlier\/ established practice is not to \(1 of 15 files do, yours now included\)\. Not forbidden, but it departs from what the rest of packages\/outlier\/ does\./, c.out);
});

test('the same outlier file edited to hit an untouched module fires the pre-existing first-crossing branch instead, not the new one', () => {
  const orig = readFileSync(join(repo, 'packages/outlier/Reach.ts'), 'utf8');
  w('packages/outlier/Reach.ts', "import { util2 } from '../newmod/util2';\nexport const reach = () => util2();\n");
  try {
    const c = grain(['check', 'packages/outlier/Reach.ts']);
    assert.match(c.out, /\[grain\] architecture: your import of `packages\/newmod\/util2\.ts` \(line 1\) is the FIRST edge packages\/outlier → packages\/newmod \(0 existing\)/, c.out);
    assert.doesNotMatch(c.out, /established practice is not to/, c.out);
  } finally { w('packages/outlier/Reach.ts', orig); }
});

test('an ordinary file doing what the rest of its module does draws no layering-norm note', () => {
  const c = grain(['check', 'packages/consumer/C0.ts', '--all']); // --all: prove no note exists at all, not just none shown by default
  assert.doesNotMatch(c.out, /\[grain\] architecture:/, c.out); // fwd exists, exp for (consumer, target) is 'true' — not the minority case
});

test('a pair with too little evidence to accept anything stays silent', () => {
  const c = grain(['check', 'packages/small/SmallReach.ts', '--all']);
  assert.doesNotMatch(c.out, /\[grain\] architecture:/, c.out); // packages/small has only 4 files — below CFG.minRaw/minEff
});

test('report() summarizes accepted layering departures in the architecture section', () => {
  const c = grain(['report']);
  assert.match(c.out, /== architecture —/, c.out);
  assert.match(c.out, /established layering: 1 module pair\(s\) where reaching the target is the counted exception, not the practice/, c.out);
});
