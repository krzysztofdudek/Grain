// Issue 394: `grain propose` on Yggdrasil's own repository wrote a node graph with two structural cycles, and
// `yg adopt` refused the whole proposal ("The proposed graph does not hold together"). The two loops had two
// different causes, and both are reproduced here with the shape they had there:
//
//   1. PARENT ⇄ CHILD. `source/cli/src/portal` imports `source/cli/src/portal/api` and the api imports the
//      portal back. The node graph declared both directions, although Yggdrasil exempts an ancestor/descendant
//      pair from the undeclared-dependency check entirely, so neither declaration was needed and together they
//      made a loop. (The same happened between `source/cli/src` and its child `source/cli/src/cli`.)
//   2. A REAL CYCLE IN THE CODE between sibling nodes: `core` imports `structure` in several places, and one
//      file in `structure` imports `core` back. The node graph declared both directions and shipped red.
//
// The answer to (1) is to declare nothing between nested nodes; the answer to (2) is to leave the weakest edge
// of each loop undeclared and name it in the proposal, so the graph can be adopted and the one import that
// closes the loop is reported where it lives. Never a proposal that fails as a whole.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNodes } from '../engine/propose-nodes.mjs';

const type = (id, dir, files) => ({ id, dir, files: new Set(files), why: `type ${id}` });
const active = [
  type('src', 'src', ['src/index.ts', 'src/main.ts']),
  type('cli', 'src/cli', ['src/cli/a.ts', 'src/cli/b.ts']),
  type('core', 'src/core', ['src/core/check.ts', 'src/core/fill.ts', 'src/core/pair-hash.ts']),
  type('structure', 'src/structure', ['src/structure/runner.ts', 'src/structure/observations.ts']),
  type('portal', 'src/portal', ['src/portal/server.ts', 'src/portal/routes.ts']),
  type('portal-api', 'src/portal/api', ['src/portal/api/boundary.ts', 'src/portal/api/graph.ts']),
];
const edge = (from, to, n = 1) => ({ from, to, n });
const exp = {
  edges: [
    edge('src/index.ts', 'src/cli/a.ts', 2), // parent → child
    edge('src/cli/a.ts', 'src/core/check.ts', 4),
    edge('src/cli/b.ts', 'src/index.ts'), // child → parent: with the line above, loop (1) between src and src/cli
    edge('src/core/fill.ts', 'src/structure/runner.ts', 5), // core → structure, the strong direction
    edge('src/structure/observations.ts', 'src/core/pair-hash.ts', 1), // structure → core: closes loop (2)
    edge('src/portal/server.ts', 'src/portal/api/boundary.ts', 3), // portal → portal/api
    edge('src/portal/api/graph.ts', 'src/portal/routes.ts', 2), // portal/api → portal: loop (1) again
    edge('src/portal/api/graph.ts', 'src/core/check.ts', 1),
  ],
};

// the same reading `yg check`'s `structural-cycle` makes: every declared relation, a loop anywhere is a failure
function findLoop(nodes) {
  const adj = new Map(nodes.map(n => [n.id, n.relations.map(r => r.target)]));
  const colour = new Map();
  let loop = null;
  const dfs = (id, path) => {
    colour.set(id, 1);
    for (const t of adj.get(id) || []) {
      if (loop) return;
      if (colour.get(t) === 1) { loop = [...path.slice(path.indexOf(t)), id, t]; return; }
      if (!colour.has(t)) dfs(t, [...path, id]);
    }
    colour.set(id, 2);
  };
  for (const n of nodes) if (!colour.has(n.id) && !loop) dfs(n.id, []);
  return loop;
}

test('the proposed node graph has no structural cycle, so yg adopt can take it in (issue 394)', () => {
  const { nodes } = buildNodes(active, exp);
  assert.equal(findLoop(nodes), null);
});

test('no relation is declared between a node and its own ancestor or descendant (issue 394)', () => {
  const { nodes } = buildNodes(active, exp);
  for (const n of nodes)
    for (const r of n.relations)
      assert.ok(!r.target.startsWith(n.id + '/') && !n.id.startsWith(r.target + '/'), `${n.id} declares ${r.target}`);
  // the portal ⇄ api pair and the src ⇄ src/cli pair were the two loops of the first kind
  const byId = new Map(nodes.map(n => [n.id, n]));
  assert.deepEqual(byId.get('src/portal').relations, []);
  assert.deepEqual(byId.get('src/portal/api').relations.map(r => r.target), ['src/core']);
});

test('a real cycle between sibling nodes is broken at its weakest edge, which is left undeclared and reported (issue 394)', () => {
  const { nodes, cycles } = buildNodes(active, exp);
  const byId = new Map(nodes.map(n => [n.id, n]));
  // the strong direction stays declared; the one import that closes the loop does not
  assert.deepEqual(byId.get('src/core').relations.map(r => r.target), ['src/structure']);
  assert.deepEqual(byId.get('src/structure').relations, []);
  // and it is named, with the loop it closed, for the proposal's report and backlog
  assert.equal(cycles.length, 1);
  assert.equal(cycles[0].from, 'src/structure');
  assert.equal(cycles[0].to, 'src/core');
  assert.equal(cycles[0].n, 1);
  assert.ok(cycles[0].cycle.includes('src/core') && cycles[0].cycle.includes('src/structure'));
  // an edge that closes no loop is never touched
  assert.deepEqual(byId.get('src/cli').relations.map(r => r.target), ['src/core']);
});
