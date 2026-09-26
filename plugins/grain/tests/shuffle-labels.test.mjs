// The label null behind `grain selftest --null` (learn.mjs `shuffleLabels`) must deal the role labels and the
// directories out again without changing any marginal the role and directory cells are drawn from: within each scope
// kind, every group keeps its size and its number of ambiguous members, the assigned scopes stay the assigned scopes,
// and the directories are a permutation of the kind's own directories. Only the scope-to-label link may move.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shuffleLabels } from '../engine/learn.mjs';
import { rng } from '../engine/selftest-null.mjs';

function fixture() {
  const ps = [],
    assign = new Map(),
    amb = new Set();
  const add = (kind, rel, role, ambiguous) => {
    const i = ps.length;
    ps.push({ kind, rel, name: 's' + i, preds: {} });
    if (role !== undefined) assign.set(i, role);
    if (ambiguous) amb.add(i);
  };
  for (let k = 0; k < 12; k++) add('method', `src/a/m${k}.ts`, 0, k % 4 === 0);
  for (let k = 0; k < 7; k++) add('method', `src/b/m${k}.ts`, 1, k === 3);
  for (let k = 0; k < 5; k++) add('method', `test/m${k}.ts`); // unassigned
  for (let k = 0; k < 6; k++) add('class', `src/c/c${k}.ts`, 2, false);
  for (let k = 0; k < 4; k++) add('class', `lib/c${k}.ts`, 3, k < 2);
  return { ps, ri: { assign, amb } };
}
const tally = (ps, ri) => {
  const t = {};
  for (const [i, r] of ri.assign) {
    const k = `${ps[i].kind}/${r}`;
    t[k] ||= { n: 0, amb: 0 };
    t[k].n++;
    if (ri.amb.has(i)) t[k].amb++;
  }
  return t;
};
const relsOf = (ps, kind, key) => ps.filter(s => s.kind === kind).map(s => s[key]).sort();

test('shuffleLabels keeps every group size, ambiguity count, assigned set and directory multiset per kind', () => {
  for (const seed of [1, 2, 3, 7]) {
    const { ps, ri } = fixture();
    const before = tally(ps, ri),
      assigned = [...ri.assign.keys()].sort((a, b) => a - b),
      labels = [...ri.assign].map(([i, r]) => `${i}:${r}`).join(',');
    shuffleLabels(ps, ri, rng(seed));
    assert.deepEqual(tally(ps, ri), before, `seed ${seed}: group sizes and ambiguity counts`);
    assert.deepEqual([...ri.assign.keys()].sort((a, b) => a - b), assigned, `seed ${seed}: the assigned scopes`);
    for (const kind of ['method', 'class']) assert.deepEqual(relsOf(ps, kind, 'nullRel'), relsOf(ps, kind, 'rel'), `seed ${seed}: ${kind} directories`);
    assert.notEqual([...ri.assign].map(([i, r]) => `${i}:${r}`).join(','), labels, `seed ${seed}: the labels moved`);
  }
});

test('shuffleLabels never deals a label across scope kinds', () => {
  const { ps, ri } = fixture();
  shuffleLabels(ps, ri, rng(5));
  for (const [i, r] of ri.assign) assert.equal(ps[i].kind === 'method' ? r <= 1 : r >= 2, true, `scope ${i} (${ps[i].kind}) got role ${r}`);
});
