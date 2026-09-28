// Issue 504: `grain propose --shape types` on Grain's own repository, then `yg adopt` and `yg check`, reported
// `ambiguous-node-type` on two files under `plugins/grain/tests/stress/results/`. In the types shape a node is written
// only for a type whose directory sits inside another type's, because every file under it matches two or more `when`s
// and only a node can say which type it is. The node for `plugins/grain/tests/stress` could not map its directory
// (a nested project, `tests/stress/oracles/*/.yggdrasil/`, lives under it), so it mapped an explicit list — and the
// list named only the 12 files its type's evidence named, not the rest of the files its `when` selects. Those rest
// matched three types and no node. The shape is reproduced here: a nested type, a nested project under it, and a file
// under its directory that its type's evidence does not name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNodes, nestedProjectRoots } from '../engine/propose.mjs';

const type = (id, dir, files) => ({ id, dir, files: new Set(files), why: `type ${id}` });
// `tests` and `tests/stress` are both types; only the nested one gets a node in the types shape
const stress = type('tests-stress', 'tests/stress', ['tests/stress/run.mjs', 'tests/stress/score.mjs']);
const tracked = [
  'tests/a.test.mjs',
  'tests/stress/run.mjs',
  'tests/stress/score.mjs',
  'tests/stress/results/baseline.json', // selected by the type's `when`, never named by its evidence
  'tests/stress/deep/probe/case.mjs',
  'tests/stress/oracles/grain/.yggdrasil/yg-config.yaml', // a nested project: every Yggdrasil check skips it
  'tests/stress/oracles/grain/model.txt',
];
const nested = nestedProjectRoots(tracked);

test('the types shape: a nested type\'s node claims every live file under its directory, not only its type\'s files (issue 504)', () => {
  const { nodes } = buildNodes([stress], { edges: [] }, nested, { dirFiles: tracked });
  const n = nodes.find(x => x.id === 'tests/stress');
  assert.equal(n.useDir, false, 'a nested project under the directory forces the explicit list');
  assert.deepEqual([...n.ownFiles].sort(), [
    'tests/stress/deep/probe/case.mjs',
    'tests/stress/results/baseline.json',
    'tests/stress/run.mjs',
    'tests/stress/score.mjs',
  ], 'every file the `when` selects that Yggdrasil sees is claimed, and nothing inside the nested project');
});

test('the types shape: a deeper nested node still takes its own files away from the node above it (issue 504)', () => {
  const probe = type('tests-stress-deep-probe', 'tests/stress/deep/probe', ['tests/stress/deep/probe/case.mjs']);
  const { nodes } = buildNodes([stress, probe], { edges: [] }, nested, { dirFiles: tracked });
  const n = nodes.find(x => x.id === 'tests/stress');
  assert.ok(!n.ownFiles.has('tests/stress/deep/probe/case.mjs'), 'the deeper node owns its file, never both');
  assert.ok(n.ownFiles.has('tests/stress/results/baseline.json'));
});

test('the node shape keeps its type\'s files: a file no node claims is only unmapped there', () => {
  const { nodes } = buildNodes([stress], { edges: [] }, nested);
  assert.deepEqual([...nodes.find(x => x.id === 'tests/stress').ownFiles].sort(), ['tests/stress/run.mjs', 'tests/stress/score.mjs']);
});
