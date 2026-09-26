// Issue 390: a role cell of a kind with ONE group in its partition is contrasted with the scopes of its kind that role
// induction assigned in the OTHER partitions, not with its own partition. Against the partition the group wins by
// being assigned (induction assigns only scopes with content of their own, so a lone group of handlers "calls
// validate" against the partition's empty constructors by construction), and the label null cannot move a lone
// group, so it could not see that. Assigned against assigned, the claim is about the group; a boolean predicate the
// other partitions' vocabularies do not carry is not done there and counts as `false`; a placement predicate is left
// out, because partitions are cut on directories and it would win against them by construction. The matching null
// deals the assigned scopes' predicates out again across partitions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mine } from '../engine/core.mjs';
import { shuffleAssignedAcrossPartitions } from '../engine/learn.mjs';
import { rng } from '../engine/selftest-null.mjs';

const S = '\u0001';
// one partition: `group` members (the only group of methods) and `outside` unassigned members
function partition(pid, group, outside) {
  const ps = [],
    assign = new Map();
  for (const [v, n] of Object.entries(group))
    for (let k = 0; k < n; k++) {
      assign.set(ps.length, 0);
      ps.push({ kind: 'method', rel: `src/handlers/h${ps.length}.ts`, name: `handle${ps.length}`, preds: { [pid]: v } });
    }
  for (const [v, n] of Object.entries(outside))
    for (let k = 0; k < n; k++) ps.push({ kind: 'method', rel: `src/handlers/c${ps.length}.ts`, name: `ctor${ps.length}`, preds: { [pid]: v } });
  return { ps, ri: { assign, amb: new Set() } };
}
// the repository-wide pool learn() passes: this partition's assigned scopes plus `elsewhere` assigned scopes of the
// kind in other partitions (`elsewhereN` of them in all, some of which may not carry the predicate at all)
function repoRole(pid, group, elsewhere, elsewhereN) {
  const t = Object.create(null);
  for (const src of [group, elsewhere]) for (const [v, n] of Object.entries(src)) t[v] = (t[v] || 0) + n;
  const own = Object.values(group).reduce((a, b) => a + b, 0);
  return new Map([
    ['method' + S + pid, t],
    ['method', own + elsewhereN],
  ]);
}
const roleFacts = ({ ps, ri }, rr) => mine(ps, ri, () => 1, [], null, null, { repoRole: rr }).facts.filter(f => /^r\d/.test(f.cid));

test('a lone group that differs from its partition only by being assigned, and does what assigned scopes elsewhere do, states nothing', () => {
  const pid = 'auto.call:validate',
    group = { true: 30 };
  const p = partition(pid, group, { false: 30 });
  // without the repository-wide pool (a direct caller) the partition is the reference and the group is stated
  assert.ok(roleFacts(p, null).some(f => f.pid === pid && f.exp === 'true'));
  // the assigned scopes of the other partitions validate too: nothing about this group
  assert.deepEqual(roleFacts(p, repoRole(pid, group, { true: 60 }, 60)).map(f => [f.cid, f.exp]), []);
});

test('a lone group that does what the assigned scopes elsewhere do not is stated', () => {
  const pid = 'auto.call:validate',
    group = { true: 30 };
  const facts = roleFacts(partition(pid, group, { false: 30 }), repoRole(pid, group, { false: 60 }, 60));
  assert.ok(facts.some(f => f.cid === 'r0:method' && f.pid === pid && f.exp === 'true'), JSON.stringify(facts.map(f => [f.cid, f.exp])));
});

test('assigned scopes elsewhere whose partition has no such predicate count as not doing it', () => {
  const pid = 'auto.call:validate',
    group = { true: 30 };
  // 60 assigned methods elsewhere, none of whose partitions has `validate` in its vocabulary
  const facts = roleFacts(partition(pid, group, { false: 30 }), repoRole(pid, group, {}, 60));
  assert.ok(facts.some(f => f.cid === 'r0:method' && f.pid === pid && f.exp === 'true'), JSON.stringify(facts.map(f => [f.cid, f.exp])));
  // and with no assigned method anywhere else there is nothing to contrast with
  assert.deepEqual(roleFacts(partition(pid, group, { false: 30 }), repoRole(pid, group, {}, 0)).map(f => f.cid), []);
});

test('a placement predicate of a lone group is not contrasted with the other partitions', () => {
  const pid = 'auto.dir2',
    group = { handlers: 30 };
  const facts = roleFacts(partition(pid, group, { handlers: 30 }), repoRole(pid, group, { services: 60 }, 60));
  assert.deepEqual(facts.map(f => [f.cid, f.pid]), []);
});

test('the one-group null deals assigned scopes\' predicates across partitions and keeps every count', () => {
  const a = partition('auto.call:validate', { true: 10 }, { false: 5 }),
    b = partition('auto.call:validate', { false: 12 }, { false: 3 });
  const before = [a, b].map(p => [...p.ri.assign.keys()].map(i => p.ps[i].preds));
  const unassigned = [a, b].map(p => p.ps.filter((_, i) => !p.ri.assign.has(i)).map(s => s.preds));
  shuffleAssignedAcrossPartitions([a, b], rng(3));
  const after = [a, b].map(p => [...p.ri.assign.keys()].map(i => p.ps[i].preds));
  // each partition keeps its number of assigned scopes, the repository its outcomes, the unassigned their own
  assert.deepEqual(after.map(x => x.length), before.map(x => x.length));
  const tally = xs => xs.flat().reduce((t, p) => ((t[p['auto.call:validate']] = (t[p['auto.call:validate']] || 0) + 1), t), {});
  assert.deepEqual(tally(after), tally(before));
  assert.deepEqual([a, b].map(p => p.ps.filter((_, i) => !p.ri.assign.has(i)).map(s => s.preds)), unassigned);
  // and the link between a partition and its assigned scopes' values is broken: a's ten `true` did not all stay
  assert.ok(after[0].filter(p => p['auto.call:validate'] === 'true').length < 10);
});
