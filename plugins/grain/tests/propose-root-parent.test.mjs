// `root` in a proposed type's `parents:` (issue 455).
//
// From Yggdrasil 6.1.0 a type that lists `parents:` may sit at the top of `model/` only when the list names the
// reserved entry `root`; a 6.0.0 CLI refuses `root` as an undefined type. So `grain propose` writes `root` on
// exactly the types it placed a node of at the top level, and only for a CLI that reports 6.1.0 or later (or
// when no CLI resolves). These tests stand a fake `yg` in for the version question: it answers `--version` and
// fails every other command, so no drill or dry run reaches a real Yggdrasil. The real CLI's verdict on the
// same shape is the seam test's job (`seams.test.mjs`).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml } from '../engine/yggdrasil-graph.mjs';
import { rootParentSupported, ygVersion } from '../engine/propose.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const GRAIN_BIN = join(here, '..', 'bin', 'grain.mjs');
const gitEnv = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' };

let tmp, repo;
// `src/main` is a type cut below the top, so its node sits under an organizational `module` node `src`;
// `tests` is a type whose node sits at the top itself.
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-root-parent-'));
  repo = join(tmp, 'repo');
  const w = (rel, s) => { const p = join(repo, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, s); };
  for (const n of ['alpha', 'beta', 'gamma', 'delta']) {
    w(`src/main/api/${n}-handler.ts`, `import { normalise } from '../util/${n}-helper';\nexport function handle${n}(x: string): string { return normalise(x); }\n`);
    w(`src/main/util/${n}-helper.ts`, 'export function normalise(v: string): string { return v.trim(); }\n');
    w(`tests/${n}.test.ts`, `import { handle${n} } from '../src/main/api/${n}-handler';\nexport function t${n}(): string { return handle${n}(' a '); }\n`);
  }
  w('README.md', '# fixture\n');
  execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main'], { env: gitEnv });
  execFileSync('git', ['-C', repo, 'add', '-A'], { env: gitEnv });
  execFileSync('git', ['-C', repo, 'commit', '-q', '-m', 'fixture'], { env: gitEnv });
});
after(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best effort */ } });

function fakeYg(version) {
  const p = join(tmp, `yg-${version}.mjs`);
  writeFileSync(p, `if (process.argv[2] === '--version') { console.log('${version}'); process.exit(0); }\nprocess.exit(1);\n`);
  return p;
}
function propose(ygBin, name) {
  const out = join(tmp, name);
  const r = spawnSync('node', [GRAIN_BIN, 'propose', out, '--no-history'], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 150_000, env: { ...process.env, YG_BIN: ygBin } });
  assert.equal(r.status, 0, r.stderr);
  const arch = parseYaml(readFileSync(join(out, '.yggdrasil', 'yg-architecture.yaml'), 'utf8'));
  const nodes = execFileSync('find', [join(out, '.yggdrasil', 'model'), '-name', 'yg-node.yaml'], { encoding: 'utf8' }).trim().split('\n')
    .map(f => ({ path: dirname(f).slice(join(out, '.yggdrasil', 'model').length + 1), type: parseYaml(readFileSync(f, 'utf8')).type }));
  return { types: arch.node_types, nodes, stderr: r.stderr };
}

test('the version gate: 6.1.0 and later, or no version, take `root`; 6.0.x does not', () => {
  assert.equal(rootParentSupported(null), true);
  assert.equal(rootParentSupported('6.1.0'), true);
  assert.equal(rootParentSupported('6.2.3'), true);
  assert.equal(rootParentSupported('7.0.0'), true);
  assert.equal(rootParentSupported('6.0.0'), false);
  assert.equal(rootParentSupported('6.0.9'), false);
  assert.equal(rootParentSupported('5.9.0'), false);
  assert.equal(ygVersion({ have: false }), null);
  assert.equal(ygVersion({ have: true, cmd: 'node', pre: [fakeYg('6.1.0')] }), '6.1.0');
});

test('against a 6.1.0 CLI, exactly the types with a node at the top list `root`, first', { timeout: 180_000 }, () => {
  const { types, nodes } = propose(fakeYg('6.1.0'), 'out-61');
  const top = new Set(nodes.filter(n => !n.path.includes('/')).map(n => n.type));
  assert.ok(top.has('module') && top.has('tests'), `the fixture must put a module and the tests type at the top: ${JSON.stringify(nodes)}`);
  assert.ok(nodes.some(n => n.path.includes('/') && n.type !== 'module'), `the fixture must nest a classifying type: ${JSON.stringify(nodes)}`);
  for (const [id, t] of Object.entries(types)) {
    const parents = t.parents || [];
    if (top.has(id)) assert.equal(parents[0], 'root', `type '${id}' has a node at the top level but its parents are [${parents.join(', ')}]`);
    else assert.ok(!parents.includes('root'), `type '${id}' has no node at the top level but lists root: [${parents.join(', ')}]`);
  }
});

test('against a 6.0.0 CLI, no type lists `root`, and the log says why', { timeout: 180_000 }, () => {
  const { types, stderr } = propose(fakeYg('6.0.0'), 'out-60');
  for (const [id, t] of Object.entries(types)) assert.ok(!(t.parents || []).includes('root'), `type '${id}' lists root for a 6.0.0 CLI`);
  assert.match(stderr, /Yggdrasil 6\.0\.0 .*predates `root` in `parents:` \(6\.1\.0\)/);
});
