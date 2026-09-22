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
