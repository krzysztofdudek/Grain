// Issue 385: a role cell is contrasted with every scope of its kind that role induction assigned to a group, not with
// the whole partition. Induction clusters the assigned scopes on their predicates, so they differ from the scopes it
// left out by construction; against the whole partition, a group of a kind with one dominant cluster "beat" the
// partition merely by being assigned. On Grain's own tests partition every group's methods were camelCase while the
// unassigned ones were the one-word `it` callbacks, and shuffling the role labels among the assigned scopes certified
// the same 9 cells every seed. The label null keeps the assigned pool, so only a contrast inside it is a role claim.
// A kind with a single group is the assigned pool itself: here, with no repository-wide pool passed, it keeps the
// partition as its reference; learn() passes that pool, and issue 390 contrasts it with the other partitions
// (tests/one-group-role-reference.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mine } from '../engine/core.mjs';

// `groups`: per role group, how many members carry each value; `outside`: the unassigned scopes' values
function fixture(pid, groups, outside) {
  const ps = [],
    assign = new Map();
  groups.forEach((vals, r) => {
    for (const [v, n] of Object.entries(vals))
      for (let k = 0; k < n; k++) {
        assign.set(ps.length, r);
        ps.push({ kind: 'method', rel: `src/g${r}/m${ps.length}.ts`, name: `m${ps.length}`, preds: { [pid]: v } });
      }
  });
  for (const [v, n] of Object.entries(outside))
    for (let k = 0; k < n; k++) ps.push({ kind: 'method', rel: `src/o/m${ps.length}.ts`, name: `m${ps.length}`, preds: { [pid]: v } });
  return { ps, ri: { assign, amb: new Set() } };
}
const roleFacts = ({ ps, ri }) => mine(ps, ri, () => 1, [], null, null, {}).facts.filter(f => /^r\d/.test(f.cid));

test('385: groups that all restate the assigned scopes, against unassigned scopes that differ, certify no role cell', () => {
  const pid = 'auto.nameshape';
  const facts = roleFacts(fixture(pid, [{ 'a(Ua)+': 30 }, { 'a(Ua)+': 30 }], { a: 60 }));
  assert.deepEqual(facts.map(f => [f.cid, f.pid, f.exp]), [], 'the only contrast here is assigned against unassigned');
});

test('385: a group that departs from the other assigned scopes still certifies', () => {
  const pid = 'auto.call:foo';
  const facts = roleFacts(fixture(pid, [{ true: 30 }, { false: 30 }], { false: 60 }));
  assert.ok(
    facts.some(f => f.cid === 'r0:method' && f.pid === pid && f.exp === 'true'),
    `expected r0 "calls foo": ${JSON.stringify(facts.map(f => [f.cid, f.exp]))}`
  );
});

test('385: a group absence is contrasted with the rest of the assigned scopes, not with the unassigned ones', () => {
  const pid = 'auto.call:runExtractor';
  // every assigned scope avoids the call and only unassigned scopes make it: no group absence
  const none = roleFacts(fixture(pid, [{ false: 30 }, { false: 30 }], { true: 60 }));
  assert.deepEqual(none.map(f => [f.cid, f.exp]), []);
  // the other group makes the call: the first group's absence is a contrast inside the assigned scopes
  const one = roleFacts(fixture(pid, [{ false: 30 }, { true: 30 }], { true: 60 }));
  assert.ok(one.some(f => f.cid === 'r0:method' && f.exp === 'false'), JSON.stringify(one.map(f => [f.cid, f.exp])));
});

test('385: without a repository-wide pool, a kind with one group is contrasted with the partition', () => {
  const pid = 'auto.call:validate';
  // 30 handler methods (the only group) validate, the 30 unassigned constructors do not
  const facts = roleFacts(fixture(pid, [{ true: 30 }], { false: 30 }));
  assert.ok(facts.some(f => f.cid === 'r0:method' && f.pid === pid && f.exp === 'true'), JSON.stringify(facts.map(f => [f.cid, f.exp])));
});
