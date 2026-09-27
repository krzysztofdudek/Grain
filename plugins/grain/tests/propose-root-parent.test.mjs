// `root` in a proposed type's `parents:` (issue 455).
//
// A Yggdrasil that knows `root` (6.1.0 with issue 419) lets a type that lists `parents:` sit at the top of
// `model/` only when the list names `root`; one that does not refuses `root` as an undefined type
// (`type-unknown-parent`), whatever version it reports. So `grain propose` asks the CLI: a one-shot
// `yg check --json` on a throwaway graph with a `parents: [root]` type at the top. These tests stand a stub `yg`
// in for that question. It answers `check --json` the way each kind of Yggdrasil does, counts how often it was
// asked, and fails every other command, so no drill or dry run reaches a real Yggdrasil. The real CLI's verdict
// on the same shape is the seam test's job (`seams.test.mjs`).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../engine/yggdrasil-graph.mjs';
import { probeRootParent } from '../engine/propose.mjs';
import { TOP_LEVEL_TYPES, writeTopLevelRepo } from './fixture-top-level-repo.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const GRAIN_BIN = join(here, '..', 'bin', 'grain.mjs');

let tmp, repo;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-root-parent-'));
  repo = writeTopLevelRepo(join(tmp, 'repo'));
});
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

// `knows`: true answers like a Yggdrasil with 419 (no issue), false like one without it (type-unknown-parent,
// and it reports 6.1.0 all the same, the case a version gate got wrong). Each `check` call appends to a log.
function stubYg(name, knows) {
  const p = join(tmp, `yg-${name}.mjs`);
  const log = join(tmp, `yg-${name}.log`);
  const issues = knows ? [] : [{ severity: 'error', code: 'type-unknown-parent' }];
  writeFileSync(p, [
    `import { appendFileSync } from 'node:fs';`,
    `const a = process.argv.slice(2);`,
    `if (a[0] === '--version') { console.log('6.1.0'); process.exit(0); }`,
    `if (a[0] === 'check' && a.includes('--json')) {`,
    `  appendFileSync(${JSON.stringify(log)}, 'check\\n');`,
    `  console.log(JSON.stringify({ schema: 'yg-check/1', project: { nodes: 1 }, issues: ${JSON.stringify(issues)} }));`,
    `  process.exit(${knows ? 0 : 1});`,
    `}`,
    `process.exit(1);`,
  ].join('\n'));
  return { bin: p, calls: () => (existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean).length : 0) };
}
function propose(ygBin, name) {
  const out = join(tmp, name);
  const r = spawnSync('node', [GRAIN_BIN, 'propose', out, '--no-history'], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 150_000, env: { ...process.env, YG_BIN: ygBin } });
  assert.equal(r.status, 0, r.stderr);
  const types = parseYaml(readFileSync(join(out, '.yggdrasil', 'yg-architecture.yaml'), 'utf8')).node_types;
  const withRoot = Object.keys(types).filter(id => (types[id].parents || []).includes('root')).sort();
  for (const id of withRoot) assert.equal(types[id].parents[0], 'root', `type '${id}' lists root, but not first`);
  // every yg-node.yaml under model/, its directory relative to model/ with forward slashes (no `find`: Windows has none)
  const model = join(out, '.yggdrasil', 'model');
  const nodes = readdirSync(model, { recursive: true }).map(String).filter(f => basename(f) === 'yg-node.yaml')
    .map(f => ({ path: dirname(f).split(sep).join('/'), type: parseYaml(readFileSync(join(model, f), 'utf8')).type }));
  return { withRoot, nodes, stderr: r.stderr };
}

test('the probe: a CLI that refuses root says no, one that accepts it says yes, no CLI says yes, and each CLI is asked once', () => {
  const knows = stubYg('knows', true), lacks = stubYg('lacks', false);
  const k = probeRootParent({ have: true, cmd: 'node', pre: [knows.bin] });
  assert.deepEqual([k.root, k.probed], [true, true]);
  const l = probeRootParent({ have: true, cmd: 'node', pre: [lacks.bin] });
  assert.deepEqual([l.root, l.probed], [false, true]);
  assert.match(l.why, /type-unknown-parent/);
  assert.deepEqual(probeRootParent({ have: false }).root, true);
  probeRootParent({ have: true, cmd: 'node', pre: [knows.bin] });
  probeRootParent({ have: true, cmd: 'node', pre: [lacks.bin] });
  assert.equal(knows.calls(), 1, 'the probe must be cached per CLI');
  assert.equal(lacks.calls(), 1, 'the probe must be cached per CLI');
});

test('against a Yggdrasil that knows root, exactly the types with a node at the top list it, first', { timeout: 180_000 }, () => {
  const { withRoot, nodes } = propose(stubYg('knows-propose', true).bin, 'out-knows');
  const top = [...new Set(nodes.filter(n => !n.path.includes('/')).map(n => n.type))].sort();
  assert.deepEqual(top, TOP_LEVEL_TYPES, `the fixture must put these types at the top: ${JSON.stringify(nodes)}`);
  assert.ok(nodes.some(n => n.path.includes('/') && n.type !== 'module'), `the fixture must nest a classifying type: ${JSON.stringify(nodes)}`);
  assert.deepEqual(withRoot, TOP_LEVEL_TYPES);
});

test('against a Yggdrasil that refuses root, though it reports 6.1.0, no type lists it, and the log says why', { timeout: 180_000 }, () => {
  const { withRoot, stderr } = propose(stubYg('lacks-propose', false).bin, 'out-lacks');
  assert.deepEqual(withRoot, []);
  assert.match(stderr, /does not know `root` in `parents:` \(.*type-unknown-parent/);
});

// The probe's other answers (the review of issue 455): a CLI that never answers, one that prints nothing, and one
// that answers in text instead of `yg-check/1`. Each stub is a real program answering `check --json` its own way.
function stubRaw(name, body) {
  const p = join(tmp, `yg-raw-${name}.mjs`);
  writeFileSync(p, `const a = process.argv.slice(2);\nif (a[0] === 'check') {\n${body}\n}\nprocess.exit(1);\n`);
  return { have: true, cmd: 'node', pre: [p] };
}

test('the probe: a CLI that does not answer in time is stopped, and root is written unprobed, saying why', () => {
  const t0 = Date.now();
  const r = probeRootParent(stubRaw('hangs', 'setInterval(() => {}, 1000); await new Promise(() => {});'), { timeoutMs: 500 });
  assert.ok(Date.now() - t0 < 30_000, 'the probe must not wait on a CLI that never answers');
  assert.deepEqual([r.root, r.probed], [true, false]);
  assert.match(r.why, /did not answer within 0\.5 s/);
});

test('the probe: a CLI that prints nothing leaves root written unprobed', () => {
  const r = probeRootParent(stubRaw('silent', 'process.exit(0);'));
  assert.deepEqual([r.root, r.probed], [true, false]);
  assert.match(r.why, /printed nothing/);
});

test('the probe: a CLI that answers in text is read as text — refused when it names type-unknown-parent, accepted otherwise', () => {
  const refused = probeRootParent(stubRaw('text-refuses', "console.log('✗ type-unknown-parent: node type probe lists parent root, which is not defined'); process.exit(1);"));
  assert.deepEqual([refused.root, refused.probed], [false, true]);
  const accepted = probeRootParent(stubRaw('text-accepts', "console.log('yg check: 1 node, 0 issues'); process.exit(0);"));
  assert.deepEqual([accepted.root, accepted.probed], [true, true]);
});

test('a proposal written with an unprobed root says so in its log', { timeout: 180_000 }, () => {
  const silent = stubRaw('silent-propose', 'process.exit(0);');
  const { withRoot, stderr } = propose(silent.pre[0], 'out-silent');
  assert.deepEqual(withRoot, TOP_LEVEL_TYPES);
  assert.match(stderr, /`root` is written in `parents:` of top-level types without a probe \(`yg check` printed nothing to read\)/);
  const knows = propose(stubYg('knows-quiet', true).bin, 'out-knows-quiet');
  assert.doesNotMatch(knows.stderr, /without a probe/, 'a probed answer is not reported as unprobed');
});
