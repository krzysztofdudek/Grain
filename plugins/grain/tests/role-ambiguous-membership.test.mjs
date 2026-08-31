// G9: `mine()`'s role-cell bookkeeping counted an ambiguous scope (ri.amb) as a FULL member of the role's raw
// population — full rw=1 into cell.raw/sraw and a full push into cell.members — while every other consumer of
// role membership (part.assignments in this file, export.roleOf in export.mjs, a group card's member
// enumeration) excludes ambiguous scopes entirely (they map amb -> -1). Only `counts` (the MDL evidence) was
// meant to keep ambiguous scopes at half weight; raw/sraw/members are the numbers `report`/`where`/`export`
// print as "established"/the population denominator, and must agree with what every other part of the product
// already recognizes as the group's membership.
//
// Fixed in mine() (core.mjs): the role-cell add() call now passes rw=0 and gi=-1 for an ambiguous scope, so it
// contributes nothing to raw/sraw and is never pushed into members (add()'s existing `if (gi >= 0)` guard keeps
// it out) — while its counts contribution (half weight) is untouched.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mine } from '../engine/core.mjs';

// A minimal synthetic model built directly from mine()'s output (same convention as report-fact-tiers.test.mjs /
// alt-marker.test.mjs: hand-built ps + a hand-built { assign, amb } stand-in for assignAll()'s ri, no parsing
// needed — mine() only ever consumes s.preds/s.kind/s.rel plus ri.assign/ri.amb).
function roleFixture() {
  const ps = []; const assign = new Map(); const amb = new Set(); let i = 0;
  const UNAMBIGUOUS = 6, AMBIGUOUS = 5, FILLER = 100;
  // 6 unambiguous role-0 members, all carrying the marker
  for (let k = 0; k < UNAMBIGUOUS; k++) { ps.push({ kind: 'method', rel: `src/role/u${k}.ts`, name: `u${k}`, preds: { 'auto.deco:@Foo': 'true' } }); assign.set(i, 0); i++; }
  // 5 additional role-0 members flagged ambiguous by ri.amb — same marker, same role assignment
  for (let k = 0; k < AMBIGUOUS; k++) { ps.push({ kind: 'method', rel: `src/role/a${k}.ts`, name: `a${k}`, preds: { 'auto.deco:@Foo': 'true' } }); assign.set(i, 0); amb.add(i); i++; }
  // filler population elsewhere: the parent (_all) baseline the role's marker is contrasted against
  for (let k = 0; k < FILLER; k++) { ps.push({ kind: 'method', rel: `src/other/o${k}.ts`, name: `o${k}`, preds: { 'auto.deco:@Foo': 'false' } }); i++; }
  return { ps, assign, amb, UNAMBIGUOUS, AMBIGUOUS };
}

test('G9: ambiguous role members are excluded from raw/sraw/members, kept at half-weight in counts only', () => {
  const { ps, assign, amb, UNAMBIGUOUS, AMBIGUOUS } = roleFixture();
  const { facts } = mine(ps, { assign, amb }, () => 1, [], null, null, {});
  const f = facts.find(x => x.cid === 'r0:method' && x.pid === 'auto.deco:@Foo');
  assert.ok(f, `expected a mined fact for the role cell: ${JSON.stringify(facts.map(x => ({ cid: x.cid, pid: x.pid })))}`);
  assert.equal(f.raw, UNAMBIGUOUS, `established/raw population must equal only the unambiguous members: got ${f.raw}`);
  assert.equal(f.sraw, UNAMBIGUOUS, `survived-raw population must equal only the unambiguous members: got ${f.sraw}`);
  assert.equal(f.conform.length, UNAMBIGUOUS, `member list must contain only the unambiguous members: got ${f.conform.length}`);
  assert.deepEqual([...f.conform].sort((a, b) => a - b), [0, 1, 2, 3, 4, 5], 'conform must be exactly the 6 unambiguous scope indices, not the 5 ambiguous ones');
  // regression control: counts (the MDL evidence, half weight for ambiguous) must be untouched by this fix
  assert.equal(f.counts['true'], UNAMBIGUOUS + AMBIGUOUS * 0.5, `counts must still give ambiguous members half weight: got ${f.counts['true']}`);
});
