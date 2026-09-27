// Guard for the architecture-trajectory instrument: tests/stress/trajectory.mjs (research B6, issue 267). It reads
// the declared graph at every commit that touched `.yggdrasil/model/`, from git objects alone. The fixture is a
// three-commit graph history: a first graph, a relation that runs against the layering, and a node file renamed
// from the old `node.yaml` spelling to `yg-node.yaml`.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { gini, graphAt, layers, sccs, trajectory } from './stress/trajectory.mjs';
import { removeTemp } from './remove-temp.mjs';

let tmp, repo, env;
const w = (rel, content) => { const p = join(repo, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const commit = msg => {
  execFileSync('git', ['-C', repo, 'add', '-A'], { env });
  execFileSync('git', ['-C', repo, 'commit', '-q', '-m', msg], { env });
};
const node = (targets, extra = '') => `name: x\ntype: module\n${extra}relations:\n${targets.map(t => `  - target: ${t}\n    type: uses\n`).join('')}`;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'trajectory-'));
  repo = join(tmp, 'repo');
  env = { ...process.env, HOME: tmp, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' };
  mkdirSync(repo, { recursive: true });
  execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main'], { env });
  // 1: cli → core → io, the old file name for io, a description with a multi-byte character
  w('.yggdrasil/model/cli/yg-node.yaml', node(['core']));
  w('.yggdrasil/model/core/yg-node.yaml', node(['io'], 'description: "zażółć — gęślą"\n'));
  w('.yggdrasil/model/io/node.yaml', node([]));
  w('README.md', 'x\n');
  commit('first graph');
  // a commit that does not touch the model is not read
  w('README.md', 'y\n');
  commit('docs only');
  // 2: io now uses cli (layer 0 → layer 2: against the layering, and a cycle), plus an unknown target that is dropped
  w('.yggdrasil/model/io/node.yaml', node(['cli', 'nowhere']));
  commit('io uses cli');
  // 3: io renamed to the current spelling, the cycle broken
  rmSync(join(repo, '.yggdrasil/model/io/node.yaml'));
  w('.yggdrasil/model/io/yg-node.yaml', node([]));
  commit('rename, break the loop');
});
after(() => { try { removeTemp(tmp); } catch { /* best effort */ } });

test('the declared graph at a commit is read from git objects, either file spelling, targets that exist only', () => {
  const head = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD~1'], { encoding: 'utf8' }).trim();
  const g = graphAt(repo, head);
  assert.deepEqual(g.nodes, ['cli', 'core', 'io']);
  assert.deepEqual(g.rel.get('io'), ['cli']);
  assert.deepEqual(g.rel.get('core'), ['io']); // parsed past the multi-byte description
});

test('components, layers and the Gini coefficient', () => {
  const rel = new Map([['a', ['b']], ['b', ['c']], ['c', ['a']], ['d', ['a']]]);
  const comps = sccs(['a', 'b', 'c', 'd'], rel);
  assert.equal(comps.filter(c => c.length > 1).length, 1);
  const { layerOf, depth } = layers(['a', 'b', 'c', 'd'], rel);
  assert.equal(layerOf.get('a'), layerOf.get('c')); // a cycle shares one layer
  assert.equal(layerOf.get('d'), layerOf.get('a') + 1);
  assert.equal(depth, 1);
  assert.equal(gini([1, 1, 1, 1]), 0);
  assert.ok(gini([0, 0, 0, 4]) > 0.7);
});

test('one row per model commit; a new relation against the previous layering is named, and so is the cycle', () => {
  const rows = trajectory(repo);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(r => r.edges), [2, 3, 2]);
  assert.deepEqual(rows.map(r => r.cycles), [0, 1, 0]);
  assert.deepEqual(rows[1].upward.map(u => [u.from, u.to, u.fromLayer, u.toLayer]), [['io', 'cli', 0, 2]]);
  assert.equal(rows[1].dEdges, 1);
  assert.equal(rows[2].upward.length, 0);
});
