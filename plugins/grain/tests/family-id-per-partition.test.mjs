// A family candidate's id reaches `yg advise` as `family-without-law:<id>`, and a maintainer dismisses, defers or
// files that nomination by it. A role group's id is a per-partition ordinal (`r0`, `r1`, ...), so two partitions
// that each found their own `r0` must not collapse into one id, and a certified convention on one partition's `r0`
// must not silence the other partition's `r0`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFamilyCandidates } from '../engine/propose-family.mjs';

const alt = (part, members) => ({
  kind: 'role group', form: 'content', viable: true, id: `${part}-content`, groupId: 'r0', part,
  members, when: { all_of: [{ content: 'class \\w+Repository' }] }, fidelity: 1,
});
const five = dir => ['A', 'B', 'C', 'D', 'E'].map(n => `${dir}/${n}Repository.ts`);

test('the same group ordinal in two partitions yields two families with distinct ids', () => {
  const out = buildFamilyCandidates([alt('api', five('api/src')), alt('web', five('web/src'))], { indexedAt: '2026-09-22T00:00:00Z' });
  const ids = out.families.map(f => f.id);
  assert.equal(ids.length, 2, `both families must survive, got ${JSON.stringify(ids)}`);
  assert.notEqual(ids[0], ids[1], 'two families must never share an id');
});

test('a certified convention on one partition\'s group does not silence the same ordinal elsewhere', () => {
  const exp = { indexedAt: '2026-09-22T00:00:00Z', conventions: [{ partition: 'api', context: { type: 'group', group: 'r0' } }] };
  const out = buildFamilyCandidates([alt('api', five('api/src')), alt('web', five('web/src'))], exp);
  assert.equal(out.families.length, 1, 'only the lawed partition\'s group may drop');
  assert.ok(out.families[0].members.every(m => m.startsWith('web/')), 'the surviving family is the unlawed partition\'s');
});

// A group that coincides with its whole host type is reported with how far the two coincide. The branch takes
// any group whose Jaccard with the host is at least 0.9, and wrote 1 for every one of them, so `yg advise`
// printed an exact fit for a group that shared nine files in ten with its type.
test('a group coinciding with its host type reports the measured overlap as its tightness', () => {
  const files = n => new Set(Array.from({ length: n }, (_, i) => `src/repo/F${i}.ts`));
  const group = { id: 'r0', markers: [{ type: 'decorator', name: 'Repository', carriers: [1, 2, 3] }], members: [] };
  const g = { part: { name: 'api' }, group: { ...group }, files: files(9) };
  const host = { dir: 'src/repo', files: files(10) };
  const out = buildFamilyCandidates([], { indexedAt: '2026-09-22T00:00:00Z' }, {}, { active: [host], groups: [g] });
  assert.equal(out.families.length, 1);
  assert.equal(out.families[0].evidence.tightness, 0.9);
});

// A family id is cut to the length yg advise keeps. Two partitions whose names share their first 80
// characters must still give two ids, so a cut id ends in a hash of the whole name.
test('two long partition names that share their first 80 characters still give two ids', () => {
  const long = 'a-very-long-monorepo-package-name-that-keeps-going-for-quite-a-while-indeed';
  const out = buildFamilyCandidates([alt(`${long}-one`, five('p1')), alt(`${long}-two`, five('p2'))], { indexedAt: '2026-09-23T00:00:00Z' });
  const ids = out.families.map((f) => f.id);
  assert.equal(ids.length, 2);
  assert.notEqual(ids[0], ids[1]);
  for (const id of ids) assert.ok(id.length <= 80, `${id} is longer than 80`);
});
