// Established layering norms: grain already MEASURES the module dependency graph (moduleGraph, computeArchHits'
// first-crossing/cycle branches) but never ran that measurement through the same acceptance mathematics as every
// other convention — so it could say a cycle exists, but never that "this one import departs from the established
// practice of its own module" when 14 of 15 files in a module correctly avoid a dependency and one outlier doesn't.
//
// architectureNorms(model) (arch.mjs) decides a (source module, target module) pair as a two-population contrast
// (mathematics.md, "Architecture norms"): over CAPABLE files only — a file with at least one resolved out-edge —
// k_A of A's n_A files reach B, k_O of the n_O capable files outside A and B do; A's outcomes are coded at A's own KT
// rate against the outside KT rate, with the BIC half log, one index cost over every pair the outside reaches, and
// the λ posterior. The value must point the way the contrast does. computeArchHits (the fourth branch, where
// `if (fwd) continue;` used to give up unconditionally the moment ANY historical forward edge existed) consults it:
// an established forward edge stays silent as before UNLESS the edited file is itself the counted exception to its
// own module's norm.
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

// n files under `dir`, each with one edge to `dir/base.ts` (so each is CAPABLE), and `reach` of them also importing B
function module(dir, n, reach, files, edges) {
  files.push(`${dir}/base.ts`);
  for (let i = 0; i < n; i++) {
    files.push(`${dir}/${i}.ts`);
    edges.push({ from: `${dir}/${i}.ts`, to: `${dir}/base.ts` });
    if (i < reach) edges.push({ from: `${dir}/${i}.ts`, to: 'B/idx.ts' });
  }
}

test('architectureNorms accepts a false norm for a module whose one outlier file departs, against a repository that reaches the target', () => {
  const files = ['B/idx.ts'], edges = [];
  module('A', 15, 1, files, edges);
  module('C', 15, 15, files, edges);
  module('D', 15, 0, files, edges);
  const norms = architectureNorms({ filesAll: files, edges, pkgs: [] });

  const ab = norms.find(n => n.from === 'A' && n.to === 'B');
  assert.ok(ab, `expected an accepted norm for A→B: ${JSON.stringify(norms)}`);
  assert.equal(ab.exp, 'false'); assert.equal(ab.ne, 14); assert.equal(ab.neff, 15); assert.ok(ab.bits > 0, `bits=${ab.bits}`);
  assert.equal(ab.kOut, 15); assert.equal(ab.nOut, 30, 'the outside population is the capable files outside A and B');

  const cb = norms.find(n => n.from === 'C' && n.to === 'B');
  assert.ok(cb, `expected an accepted norm for C→B: ${JSON.stringify(norms)}`);
  assert.equal(cb.exp, 'true'); assert.equal(cb.ne, 15); assert.equal(cb.neff, 15);
});

test('a boundary nobody has crossed is a candidate and certifies against the rate of crossing elsewhere', () => {
  const files = ['B/idx.ts'], edges = [];
  module('A', 20, 0, files, edges); // 0 of 20 reach B
  module('C', 20, 12, files, edges); // 12 of 20 do
  const norms = architectureNorms({ filesAll: files, edges, pkgs: [] });
  const ab = norms.find(n => n.from === 'A' && n.to === 'B');
  assert.ok(ab, `a never-crossed boundary must be certified: ${JSON.stringify(norms)}`);
  assert.equal(ab.exp, 'false'); assert.equal(ab.ne, 20); assert.equal(ab.neff, 20);
  assert.equal(ab.kOut, 12); assert.equal(ab.nOut, 20);
});

test('a file that imports nothing is not evidence of avoiding anything', () => {
  const files = ['B/idx.ts'], edges = [];
  for (let i = 0; i < 20; i++) files.push(`A/${i}.ts`); // 20 files, no edges at all: not capable
  module('C', 20, 12, files, edges);
  const norms = architectureNorms({ filesAll: files, edges, pkgs: [] });
  assert.ok(!norms.find(n => n.from === 'A'), `A has no capable file, so no norm: ${JSON.stringify(norms)}`);
});

test('architectureNorms rejects a pair below the raw/eff floor', () => {
  const files = ['B/idx.ts'], edges = [];
  module('C', 15, 15, files, edges);
  module('E', 15, 0, files, edges);
  module('D', 4, 1, files, edges); // D: 4 capable files — below CFG.minRaw (5)
  const norms = architectureNorms({ filesAll: files, edges, pkgs: [] });
  assert.ok(!norms.find(n => n.from === 'D'), `D→B must stay silent (raw=4 < CFG.minRaw): ${JSON.stringify(norms)}`);
  assert.ok(norms.find(n => n.from === 'C' && n.exp === 'true'), 'sanity: C→B is still accepted');
});

test('an absence is a norm only where the source reaches the target LESS than the rest of the repository', () => {
  // A reaches B in 1 of 30 files; elsewhere nobody except a handful do (5 of 60) — A is not avoiding B, B is rare
  const files = ['B/idx.ts'], edges = [];
  module('A', 30, 1, files, edges);
  module('C', 30, 5, files, edges);
  module('D', 30, 0, files, edges);
  const norms = architectureNorms({ filesAll: files, edges, pkgs: [] });
  assert.ok(!norms.find(n => n.from === 'A' && n.to === 'B'), `a rare target is not a boundary: ${JSON.stringify(norms)}`);
});

test('architectureNorms withholds a false norm when reaching the target is not a live option anywhere else', () => {
  const files = ['B/idx.ts'], edges = [];
  module('A', 15, 1, files, edges);
  module('C', 15, 0, files, edges); // nobody outside A ever reaches B
  const norms = architectureNorms({ filesAll: files, edges, pkgs: [] });
  assert.ok(!norms.find(n => n.from === 'A' && n.to === 'B'), `A→B must stay silent — nothing outside reaches B: ${JSON.stringify(norms)}`);
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
  // outlier: 15 files, 14 never reach target — Reach.ts is the one exception. Each imports its module's own base,
  // so every one of them is CAPABLE: a file that imports nothing is no evidence of avoiding anything.
  w('packages/outlier/base.ts', 'export const base = 0;\n');
  for (let i = 0; i < 14; i++) w(`packages/outlier/O${i}.ts`, `import { base } from './base';\nexport const o${i} = () => base + ${i};\n`);
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
