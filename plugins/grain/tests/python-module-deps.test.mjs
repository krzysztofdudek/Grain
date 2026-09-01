// 004: `report`'s architecture section on a real Python repo (flask) claimed "13 modules · 0 directed
// dependencies" while the source is full of intra-package imports (`from .ctx import AppContext`,
// `from .sansio.blueprints import Blueprint`, ...). Diagnosis: Python relative/absolute-import resolution
// (relations.mjs / python-resolve.mjs) is NOT broken — every one of those imports resolves into a real
// `model.edges` entry (confirmed directly against a flask clone: 118 real file-level edges inside src/flask/).
// The edges simply never reach `model.moduleGraph.edges`, because `moduleOf`/`refineModOf` bucket a
// non-dominant package (too small to trip the §G11 refinement threshold) into ONE module node — every import
// between its files is `a === b` and dropped as intra-module by design (moduleGraph's own edge-folding step,
// relations.mjs). `report()` then prints "N modules · 0 directed dependencies" with nothing to say that real
// edges exist and were folded away, reading as a measured "this code imports nothing" rather than a module-
// granularity artifact. This is the disclosure gap: a sibling to the existing relCoverageNote (§G21) note,
// which already covers "not resolved at all" but not "resolved, then folded to zero at module level".
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, pyIntra, pyCross, tsCheck;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const gitFor = dir => (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, ...gitEnv } }).trim();
const wFor = dir => (rel, content) => { mkdirSync(join(dir, dirname(rel)), { recursive: true }); writeFileSync(join(dir, rel), content); };
const grainIn = dir => args => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const modelOf = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-pydeps-'));

  // pyIntra: a small package (`pkg/`, well under the §G11 dominant-module threshold) with a relative import, an
  // absolute-package import to the SAME target, and a stdlib import — plus an unrelated `tests/` file so the
  // module graph has >1 node (report only renders the architecture section past that point).
  pyIntra = join(tmp, 'py-intra'); mkdirSync(pyIntra);
  { const git = gitFor(pyIntra), w = wFor(pyIntra), grain = grainIn(pyIntra);
    git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
    w('pkg/__init__.py', '');
    w('pkg/other.py', 'class Thing:\n    pass\n');
    w('pkg/rel_user.py', 'from .other import Thing\n\n\nclass RelUser:\n    def make(self):\n        return Thing()\n');
    w('pkg/abs_user.py', 'from pkg.other import Thing\n\n\nclass AbsUser:\n    def make(self):\n        return Thing()\n');
    w('pkg/std_user.py', "from os import path\n\n\nclass StdUser:\n    def make(self):\n        return path.join('a', 'b')\n");
    w('tests/test_x.py', 'def test_x():\n    pass\n');
    git('add', '-A'); git('commit', '-qm', 'base');
    const r = grain(['status']); assert.equal(r.code, 0, r.err); }

  // pyCross: a parent-relative import (`from ..other import X`) that crosses a REAL module boundary
  // (pkg/sub → pkg) — the contrasting case where aggregation must and does produce a module-level edge.
  pyCross = join(tmp, 'py-cross'); mkdirSync(pyCross);
  { const git = gitFor(pyCross), w = wFor(pyCross), grain = grainIn(pyCross);
    git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
    w('pkg/other.py', 'class Thing:\n    pass\n');
    w('pkg/sub/deep.py', 'from ..other import Thing\n\n\nclass Deep:\n    def make(self):\n        return Thing()\n');
    git('add', '-A'); git('commit', '-qm', 'base');
    const r = grain(['status']); assert.equal(r.code, 0, r.err); }

  // tsCheck: regression control — an already-resolution-supported language's cross-module edge must render
  // exactly as before (no new disclosure line, same counts).
  tsCheck = join(tmp, 'ts-check'); mkdirSync(tsCheck);
  { const git = gitFor(tsCheck), w = wFor(tsCheck), grain = grainIn(tsCheck);
    git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
    w('modb/util.ts', 'export const util = () => 1;\n');
    w('moda/main.ts', "import { util } from '../modb/util';\nexport const main = () => util();\n");
    git('add', '-A'); git('commit', '-qm', 'base');
    const r = grain(['status']); assert.equal(r.code, 0, r.err); }
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('relative and absolute intra-package imports both resolve into real file edges (§004 diagnosis: not a resolver bug)', () => {
  const edges = modelOf(pyIntra).edges;
  assert.ok(edges.some(e => e.from === 'pkg/rel_user.py' && e.to === 'pkg/other.py'), `expected a relative-import edge: ${JSON.stringify(edges)}`);
  assert.ok(edges.some(e => e.from === 'pkg/abs_user.py' && e.to === 'pkg/other.py'), `expected an absolute-import edge, resolved the same as the relative one: ${JSON.stringify(edges)}`);
});

test('a stdlib import produces no phantom internal edge', () => {
  const edges = modelOf(pyIntra).edges;
  assert.ok(!edges.some(e => e.from === 'pkg/std_user.py' || e.to === 'pkg/std_user.py'), `"from os import path" must not create any edge: ${JSON.stringify(edges)}`);
});

test('those real edges are real but fold to zero at module level — every one lands inside the single "pkg" module node', () => {
  const mg = modelOf(pyIntra).moduleGraph;
  assert.ok(mg.nodes.length > 1, `need >1 module for report to render the architecture section: ${JSON.stringify(mg.nodes)}`);
  assert.equal(mg.edges.length, 0, `this fixture is deliberately the "small package, no refinement" shape: ${JSON.stringify(mg.edges)}`);
});

test('report never shows a bare, unexplained "0 directed dependencies" when real file-level edges exist', () => {
  const r = grainIn(pyIntra)(['report']);
  assert.equal(r.code, 0, r.err);
  const lines = r.out.split('\n');
  const hIdx = lines.findIndex(l => /^== architecture — /.test(l));
  assert.ok(hIdx >= 0, `no architecture section at all: ${r.out}`);
  assert.match(lines[hIdx], /^== architecture — 2 modules · 0 directed dependencies · 0 cycle\(s\) ==$/);
  // RED today: nothing follows the header — GREEN requires a disclosure line naming the real, folded-away edges
  const next = lines[hIdx + 1] || '';
  assert.match(next, /^  2 file-level edges resolved, none crossing a module boundary/, `expected an intra-module disclosure line right after the header, got: ${JSON.stringify(next)}\nfull output:\n${r.out}`);
});

test('a relative import that genuinely crosses a module boundary appears as a real moduleGraph edge, no disclosure needed', () => {
  const mg = modelOf(pyCross).moduleGraph;
  assert.deepEqual(mg.nodes.map(n => n.id).sort(), ['pkg', 'pkg/sub']);
  assert.ok(mg.edges.some(e => e.from === 'pkg/sub' && e.to === 'pkg' && e.n === 1), `expected a real pkg/sub → pkg module edge: ${JSON.stringify(mg.edges)}`);
  const r = grainIn(pyCross)(['report']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^== architecture — 2 modules · 1 directed dependencies · 0 cycle\(s\) ==$/m);
  assert.doesNotMatch(r.out, /file-level edge.*resolved, none crossing/, r.out);
});

test('regression: an already-resolution-supported language (TypeScript) still gets its correct cross-module edge, unchanged', () => {
  const mg = modelOf(tsCheck).moduleGraph;
  assert.ok(mg.edges.some(e => e.from === 'moda' && e.to === 'modb' && e.n === 1), `expected the real moda → modb edge: ${JSON.stringify(mg.edges)}`);
  const r = grainIn(tsCheck)(['report']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /^== architecture — 2 modules · 1 directed dependencies · 0 cycle\(s\) ==$/m);
  assert.doesNotMatch(r.out, /file-level edge.*resolved, none crossing/, r.out);
  assert.doesNotMatch(r.out, /resolution does not cover/, r.out);
});
