// G11 / C1a: `check`/`review` must compute module IDs the SAME way `report` does. `moduleGraph()` (relations.mjs)
// refines a DOMINANT flat module (one holding most of the repo) one path segment deeper before building its
// nodes/edges — a single-package repo's real architecture lives INSIDE the package, not at the flat two-segment
// level. `architectureNorms`/`computeArchHits` (core.mjs) used to call the PLAIN, unrefined `moduleOf` directly,
// so whenever refinement actually fired for a repo, the flat module id they computed almost never matched any id
// in `model.moduleGraph.edges` — every import into a dominant module read as "the FIRST edge ... (0 existing)"
// even when `report`'s own module graph showed hundreds of established edges between the very same directories
// under their refined names. Confirmed live on laravel-framework: `review` claimed the FIRST edge
// tests/Database → src/Illuminate (0 existing) while `report` on the same index showed
// tests/Database/ → src/Illuminate/Database/ (644).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, ...gitEnv } }).trim();
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const modelJson = () => JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-modrefine-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
  // one dominant package at the flat (depth-2) level: src/Illuminate — 45 of 51 files, well past the
  // refinement trigger n >= max(40, files.length * 0.5) = max(40, 25.5) = 40. Its real architecture lives ONE
  // segment deeper, in src/Illuminate/Database and src/Illuminate/Support — exactly the laravel-framework shape.
  for (let i = 0; i < 25; i++) w(`src/Illuminate/Database/D${i}.ts`, `export const d${i} = () => ${i};\n`);
  for (let i = 0; i < 20; i++) w(`src/Illuminate/Support/S${i}.ts`, `export const s${i} = () => ${i};\n`);
  // tests/Database: a small, non-dominant module. 5 of its 6 files already import src/Illuminate/Database —
  // an ESTABLISHED crossing, not a first edge. The 6th (T5) does not import anything yet.
  for (let i = 0; i < 5; i++) w(`tests/Database/T${i}.ts`, `import { d${i} } from '../../src/Illuminate/Database/D${i}';\nexport const t${i} = () => d${i}();\n`);
  w('tests/Database/T5.ts', 'export const t5 = () => 5;\n');
  git('add', '-A'); git('commit', '-qm', 'base');
  const r = grain(['status']); assert.equal(r.code, 0, r.err);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('report shows the established, refined-module edge that check/review must agree with', () => {
  const r = grain(['report']);
  assert.match(r.out, /tests\/Database\/ → src\/Illuminate\/Database\/ \(5\)/, r.out);
});

test('check on a new import into an ALREADY-established module pair does not falsely claim a first edge', () => {
  const orig = readFileSync(join(repo, 'tests/Database/T5.ts'), 'utf8');
  w('tests/Database/T5.ts', "import { d5 } from '../../src/Illuminate/Database/D5';\nexport const t5 = () => d5();\n");
  try {
    const c = grain(['check', 'tests/Database/T5.ts', '--all']);
    // GREEN: an established crossing (5 existing edges at HEAD under the refined module names) stays silent —
    // it must NOT be reported as the first edge between "tests/Database" and the flat, non-existent "src/Illuminate".
    assert.doesNotMatch(c.out, /\[grain\] architecture:/, c.out);
  } finally { w('tests/Database/T5.ts', orig); }
});

test('a genuinely first crossing into the dominant module is labeled with the refined node, not the flat placeholder', () => {
  const orig = readFileSync(join(repo, 'tests/Database/T5.ts'), 'utf8');
  w('tests/Database/T5.ts', "import { s0 } from '../../src/Illuminate/Support/S0';\nexport const t5 = () => s0();\n");
  try {
    const c = grain(['check', 'tests/Database/T5.ts']);
    const m = c.out.match(/is the FIRST edge (\S+) → (\S+) \(0 existing\)/);
    assert.ok(m, `expected a first-edge architecture note: ${c.out}`);
    const [, from, to] = m;
    // consistency assertion: every module id check/review print must be drawn from the SAME vocabulary
    // moduleGraph/report use — model.moduleGraph.nodes, not a different, flatter one of check's own invention.
    const nodeIds = new Set(modelJson().moduleGraph.nodes.map(n => n.id));
    assert.ok(nodeIds.has(from), `"${from}" must be a real moduleGraph node: ${[...nodeIds]}`);
    assert.ok(nodeIds.has(to), `"${to}" must be a real moduleGraph node — the flat, non-existent "src/Illuminate" is NOT one: ${[...nodeIds]}`);
    assert.equal(to, 'src/Illuminate/Support');
  } finally { w('tests/Database/T5.ts', orig); }
});
