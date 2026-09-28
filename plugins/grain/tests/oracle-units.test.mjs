// Ownership units in `grain oracle score` (issue 509).
//
// A graph in the types shape writes a node only where a type sits inside another and covers every other file by the
// one type whose `when` matches it (`coverage.type_level`). Scored by its nodes alone it looks as if it owned a
// fraction of the repository. These tests pin the reading that replaces that: a file belongs to the deepest node
// mapping it, else — only where that graph turns type-level coverage on — to the one type that matches it; a file two
// types match and no node claims belongs to nobody, as Yggdrasil refuses it. A type unit carries its type's
// relations, a node unit its node's, and the same measures then run over units.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { typeRelationTargets, unitsOf } from '../engine/oracle-units.mjs';
import { scoreRecord, unitLines } from '../engine/oracle.mjs';

const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
const node = (id, files, { type = null, relations = [] } = {}) => ({ id, type, files, relations: relations.map(target => ({ target })) });
const type = (id, files, relations = []) => ({ id, classifying: true, files, relations: relations.map(target => ({ target })) });

test('a file no node maps belongs to its one type only where the graph turns type-level coverage on', () => {
  const side = { nodes: [node('core', range(0, 4), { type: 'lib' })], types: [type('lib', range(0, 4)), type('tool', range(4, 10))] };
  const off = unitsOf({ ...side, typeLevel: false });
  assert.deepEqual(off.nodes.map(u => u.id), ['node:core']);
  assert.equal(off.owned, 4);
  assert.equal(off.typeCovered, 0);
  const on = unitsOf({ ...side, typeLevel: true });
  assert.deepEqual(on.nodes.map(u => [u.id, u.files.length]), [['node:core', 4], ['type:tool', 6]]);
  assert.equal(on.owned, 10);
  assert.equal(on.typeCovered, 6);
});

test('a node beats a type, the deepest node beats its parent, and a file two types match with no node belongs to nobody', () => {
  const u = unitsOf({
    typeLevel: true,
    nodes: [node('src', range(0, 6)), node('src/inner', [4, 5])],
    types: [type('a', range(0, 12)), type('b', range(8, 12))],
  });
  const byId = new Map(u.nodes.map(x => [x.id, x.files]));
  assert.deepEqual(byId.get('node:src'), [0, 1, 2, 3]);
  assert.deepEqual(byId.get('node:src/inner'), [4, 5]);
  assert.deepEqual(byId.get('type:a'), [6, 7], 'files 8..11 match both types and no node: ambiguous, owned by neither');
  assert.equal(byId.has('type:b'), false);
  assert.equal(u.owned, 8);
});

test('a file only a strict type matches, and no node maps, is a strict orphan: Yggdrasil covers it by no type, so no unit owns it', () => {
  const strict = (id, files) => ({ ...type(id, files), strict: true });
  const u = unitsOf({
    typeLevel: true,
    nodes: [node('core', [0, 1], { type: 'engine' })],
    types: [strict('engine', range(0, 4)), type('doc', [5, 6]), type('any', [3, 6])],
  });
  const byId = new Map(u.nodes.map(x => [x.id, x.files]));
  assert.deepEqual(byId.get('node:core'), [0, 1], 'a node of the strict type still owns what it maps');
  assert.equal(byId.has('type:engine'), false, 'files 2 and 3 only the strict type claims: orphans, owned by nobody');
  assert.deepEqual(byId.get('type:doc'), [5], 'file 6 matches two types: ambiguous');
  assert.equal(u.owned, 3);
  assert.equal(u.typeCovered, 1);
});

test("a type unit carries its type's relations, to every unit of the target type; an organizational node target stands for its subtree", () => {
  const u = unitsOf({
    typeLevel: true,
    nodes: [node('app', []), node('app/web', range(0, 2), { type: 'svc', relations: ['lib-root'] }), node('lib-root', []), node('lib-root/x', [2, 3], { type: 'lib' })],
    types: [type('svc', range(0, 2)), type('lib', range(2, 6)), type('ui', range(6, 8), ['lib'])],
  });
  const rel = new Map(u.nodes.map(x => [x.id, x.relations.map(r => r.target).sort()]));
  assert.deepEqual(rel.get('node:app/web'), ['node:lib-root/x'], 'the organizational target resolved to the unit below it');
  assert.deepEqual(rel.get('type:ui'), ['node:lib-root/x', 'type:lib'], 'the lib type stands for its own unit and the node typed lib');
  assert.deepEqual(typeRelationTargets({ calls: ['a'], uses: ['b'], default: 'deny' }), [{ target: 'a', type: 'calls' }, { target: 'b', type: 'uses' }]);
});

test('scoreRecord: a types-shape proposal that owns the same files as a node-shape one scores the same on units, and less on nodes', () => {
  const files = range(0, 12).map(i => `src/${i < 6 ? 'api' : 'util'}/f${i}.ts`);
  const accepted = { typeLevel: false, types: [], aspects: [], nodes: [node('api', range(0, 6), { relations: ['util'] }), node('util', range(6, 12))] };
  const types = [type('handler', range(0, 6), ['helper']), type('helper', range(6, 12))];
  const nodesShape = { typeLevel: false, types, aspects: [], nodes: [node('api', range(0, 6), { type: 'handler', relations: ['util'] }), node('util', range(6, 12), { type: 'helper' })] };
  const typesShape = { typeLevel: true, types, aspects: [], nodes: [] };
  const rec = proposal => ({ name: 't', files, proposal, accepted });
  const a = scoreRecord(rec(nodesShape)), b = scoreRecord(rec(typesShape));
  assert.equal(a.nodes.recall.hit, 2);
  assert.equal(b.nodes.recall.hit, 0, 'no node at all in the types shape');
  for (const s of [a, b]) {
    assert.equal(s.units.recall.hit, 2);
    assert.equal(s.units.precision.hit, 2);
    assert.equal(s.units.relations.matched, 1, 'the api -> util relation is found through the handler type allowing helper');
    assert.equal(s.units.partition.leaves.vi, 0);
  }
  assert.deepEqual(b.units.typeCovered, { proposal: 12, accepted: 0 });
});

test('a record written before the switch was stored is read as node-only, and the printed score says so', () => {
  const files = range(0, 4).map(i => `f${i}`);
  const old = { types: [type('t', range(0, 4))], aspects: [], nodes: [node('n', [0, 1])] };
  const s = scoreRecord({ name: 'old', files, proposal: old, accepted: old });
  assert.deepEqual(s.units.typeLevel, { proposal: null, accepted: null });
  assert.equal(s.units.filesOwned.proposal, 2);
  const lines = unitLines(s.units).join('\n');
  assert.match(lines, /proposal not recorded, accepted not recorded/);
  assert.match(lines, /re-record the oracle/);
});
