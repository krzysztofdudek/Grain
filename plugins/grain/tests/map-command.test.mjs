// J4.3a: dependency layers on `model.moduleGraph` (SCC-condensed longest-path-to-a-leaf), `grain map`'s full-detail
// output, and the `in:` locator's `(layer n)` annotation. The `concepts:`/`sessionContext` half of the original
// ticket is J4.3b, a separate ticket — not touched here.
//
// Two fixtures in one repo (`repo`): a plain 3-layer chain (modA → modB → modC) and a 2-cycle sitting behind real
// structure on both sides (modW → modX ⇄ modY → modZ) so the SCC condensation's dropped intra-component self-edges
// can be checked against both a consumer of the cycle and a dependency of the cycle. A second, minimal repo
// (`single`) covers the no-edges, one-module case.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo, single;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const gitFor = dir => (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env: { ...process.env, ...gitEnv } }).trim();
const wFor = dir => (rel, content) => { mkdirSync(join(dir, dirname(rel)), { recursive: true }); writeFileSync(join(dir, rel), content); };
const grainIn = dir => args => { const r = spawnSync('node', [BIN, ...args], { cwd: dir, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };
const modelOf = dir => JSON.parse(readFileSync(join(dir, '.grain', 'cache', 'model.json'), 'utf8'));

// groupPartitions (core.mjs) merges any bucket under 100 scopes into `_repo`/`_root` only once the merged pool
// reaches its own 30-scope floor — below that, `model.partitions` stays empty and `check`'s `in:` line (which
// only prints once a partition covers the file) never fires. `pad` pads each fixture file with harmless extra
// exported consts (no new imports, so moduleGraph's edges/layers are unaffected) purely to clear that floor.
const pad = n => Array.from({ length: n }, (_, i) => `export const extra${i} = () => ${i};`).join('\n') + '\n';

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-map-'));

  repo = join(tmp, 'r'); mkdirSync(repo);
  { const git = gitFor(repo), w = wFor(repo), grain = grainIn(repo);
    git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
    // chain: modA → modB → modC (modC a true leaf — nothing it imports is a module)
    w('modC/leaf.ts', "export const leaf = () => 'leaf';\n" + pad(6));
    w('modB/mid.ts', "import { leaf } from '../modC/leaf';\nexport const mid = () => leaf() + 'mid';\n" + pad(6));
    w('modA/top.ts', "import { mid } from '../modB/mid';\nexport const top = () => mid() + 'top';\n" + pad(6));
    // cycle behind structure: modW imports the cycle (modX), the cycle (modX) imports a real leaf (modZ), and
    // modX/modY import each other (the 2-cycle itself)
    w('modZ/leaf2.ts', "export const leafZ = () => 'leafZ';\n" + pad(6));
    w('modX/x.ts', "import { leafZ } from '../modZ/leaf2';\nimport { y } from '../modY/y';\nexport const x = () => leafZ() + y();\n" + pad(6));
    w('modY/y.ts', "import { x } from '../modX/x';\nexport const y = () => x();\n" + pad(6));
    w('modW/w.ts', "import { x } from '../modX/x';\nexport const w = () => x();\n" + pad(6));
    git('add', '-A'); git('commit', '-qm', 'base');
    const r = grain(['status']); assert.equal(r.code, 0, r.err); }

  single = join(tmp, 's'); mkdirSync(single);
  { const git = gitFor(single), w = wFor(single), grain = grainIn(single);
    git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
    w('index.ts', "export const only = () => 1;\n"); // one module ('.'), no imports at all
    git('add', '-A'); git('commit', '-qm', 'base');
    const r = grain(['status']); assert.equal(r.code, 0, r.err); }
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('(a) a genuine 3-layer chain: leaf=0, middle=1, top=2 — RED today: no `layer` field at all', () => {
  const nodes = modelOf(repo).moduleGraph.nodes;
  const byId = Object.fromEntries(nodes.map(n => [n.id, n]));
  assert.ok('modC' in byId && 'modB' in byId && 'modA' in byId, `expected modA/modB/modC nodes: ${JSON.stringify(nodes)}`);
  assert.equal(byId.modC.layer, 0, `leaf modC must be layer 0: ${JSON.stringify(byId.modC)}`);
  assert.equal(byId.modB.layer, 1, `modB (imports modC) must be layer 1: ${JSON.stringify(byId.modB)}`);
  assert.equal(byId.modA.layer, 2, `modA (imports modB) must be layer 2: ${JSON.stringify(byId.modA)}`);
});

test('(b) a 2-cycle collapses to one shared layer, without corrupting what it imports or what imports it', () => {
  const m = modelOf(repo);
  const byId = Object.fromEntries(m.moduleGraph.nodes.map(n => [n.id, n]));
  assert.ok(m.moduleGraph.cycles.some(c => c.length === 2 && c.includes('modX') && c.includes('modY')), `expected a modX/modY cycle: ${JSON.stringify(m.moduleGraph.cycles)}`);
  assert.equal(byId.modZ.layer, 0, `modZ (the cycle's own leaf dependency) must stay layer 0: ${JSON.stringify(byId.modZ)}`);
  assert.equal(byId.modX.layer, byId.modY.layer, `modX and modY (one collapsed component) must share a layer: ${JSON.stringify([byId.modX, byId.modY])}`);
  assert.equal(byId.modX.layer, 1, `the cycle's layer must be 1 + its own leaf's layer (0), not corrupted by the intra-component self-edge: ${JSON.stringify(byId.modX)}`);
  assert.equal(byId.modW.layer, 2, `modW (imports into the cycle) must be one layer above it: ${JSON.stringify(byId.modW)}`);
});

test('(c) `grain map` prints a `layers:` section and a `decisions:` count line', () => {
  const before = grainIn(repo)(['map']);
  assert.equal(before.code, 0, before.err);
  assert.match(before.out, /^map: layers: .*layer 0 \(leaves\).*modZ\/.*· .*layer 1:.*· .*layer 2:.*$/m, before.out);
  assert.match(before.out, /^decisions: 0 maintainer decision\(s\) in force$/m, before.out);

  const add = grainIn(repo)(['decide', 'boundary', 'modZ', '--never-imports', 'modA', '--note', 'test boundary']);
  assert.equal(add.code, 0, add.err);
  try {
    const after = grainIn(repo)(['map']);
    assert.match(after.out, /^decisions: 1 maintainer decision\(s\) in force$/m, after.out);
  } finally {
    const list = grainIn(repo)(['decide', 'list']).out;
    const id = list.split('\n')[0].split(/\s+/)[0];
    grainIn(repo)(['decide', 'rm', id]);
  }
});

test('(d) the `in:` locator (via `check`) now shows `layer n`', () => {
  const c = grainIn(repo)(['check', 'modC/leaf.ts']);
  assert.equal(c.code, 0, c.err);
  // §067c: the module gets a trailing `/` here — the same directory marker `lives in:`/`depends on:`/`used by:`
  // already use elsewhere — so this locator line can never be misread as naming a file rather than the directory it is.
  assert.match(c.out.split('\n')[0], /^in: modC\/ \(layer 0\) · used by \d+ modules$/, c.out);
  const a = grainIn(repo)(['check', 'modA/top.ts']);
  assert.match(a.out.split('\n')[0], /^in: modA\/ \(layer 2\) · used by \d+ modules$/, a.out);
});

test('(e) determinism: incremental vs. full rebuild produce byte-identical nodes[].layer', () => {
  const before = modelOf(repo).moduleGraph.nodes.map(n => ({ id: n.id, layer: n.layer }));
  const git = gitFor(repo), w = wFor(repo), grain = grainIn(repo);
  w('modC/leaf.ts', "export const leaf = () => 'leaf-edited';\n"); // content-only edit: same edges, same layers
  git('commit', '-qam', 'edit leaf');
  const inc = grain(['check', 'modC/leaf.ts']); assert.equal(inc.code, 0, inc.err);
  const afterIncremental = modelOf(repo).moduleGraph.nodes.map(n => ({ id: n.id, layer: n.layer }));
  rmSync(join(repo, '.grain', 'cache'), { recursive: true });
  const full = grain(['status']); assert.equal(full.code, 0, full.err);
  const afterFull = modelOf(repo).moduleGraph.nodes.map(n => ({ id: n.id, layer: n.layer }));
  assert.deepEqual(afterIncremental, afterFull, 'incremental and full rebuild must agree on every node\'s layer');
  assert.deepEqual(before, afterFull, 'a content-only edit that changes no edges must not move any layer');
});

test('(f) a single module, no edges at all: layer 0, one line, no crash', () => {
  const nodes = modelOf(single).moduleGraph.nodes;
  assert.equal(nodes.length, 1, `expected exactly one module: ${JSON.stringify(nodes)}`);
  assert.equal(nodes[0].layer, 0, `a lone module with no edges must be layer 0: ${JSON.stringify(nodes[0])}`);
  const r = grainIn(single)(['map']);
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /layer 0 \(leaves\)/, r.out);
});
