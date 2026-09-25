// The sub-gate band is gated on grain's own objective, not on a raw share (docs/mathematics.md, "The sub-gate band").
// Result 101 measured the band as it was: 14 of 20 sampled rows were not rules at all, most of them minority usage
// read as a negative rule ("76% of files here do not import `node:url`"). A row now enters the band only where its
// contrast bits are positive, a structural predicate is a contrast, the KT posterior puts at most 1/λ below the
// two-thirds supermajority, and the row is still below certification. And a group or directory absence in mine() is
// contrasted with the rest of its partition instead of passing a 30% floor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { betaCdf, subGate } from '../engine/propose-lattice.mjs';
import { mine } from '../engine/core.mjs';

const row = over => ({ partition: 'src', cid: '_all:file', pid: 'auto.imp:x', exp: 'true', n: 60, ne: 48, share: 0.8, K: 2, bits: 5, isNorm: false, structural: false, ...over });

test('the incomplete beta is exact where it has a closed form', () => {
  assert.ok(Math.abs(betaCdf(0.5, 3.5, 3.5) - 0.5) < 1e-12, 'a symmetric Beta puts half its mass below one half');
  // Beta(1.5, 0.5) and Beta(0.5, 1.5) mirror each other
  assert.ok(Math.abs(betaCdf(0.3, 1.5, 0.5) + betaCdf(0.7, 0.5, 1.5) - 1) < 1e-12);
  // Beta(1, 1) is uniform
  assert.ok(Math.abs(betaCdf(0.37, 1, 1) - 0.37) < 1e-12);
});

test('a row whose contrast does not compress never enters the band, however high its share', () => {
  assert.equal(subGate([row({ bits: 0 })]).length, 0);
  assert.equal(subGate([row({ bits: -3 })]).length, 0);
  assert.equal(subGate([row()]).length, 1);
});

test('a structural row enters only as a contrast', () => {
  assert.equal(subGate([row({ pid: 'auto.first1', structural: true })]).length, 0);
});

test('a small sample stays out: the KT posterior must put at most 1/λ below two thirds', () => {
  // 8 of 10 is a share of 0.8, but Beta(8.5, 2.5) puts about 19% of its mass below two thirds
  assert.ok(betaCdf(2 / 3, 8.5, 2.5) > 1 / 8);
  assert.equal(subGate([row({ n: 10, ne: 8 })]).length, 0);
  // 48 of 60, the same share, puts about 1% there
  assert.ok(betaCdf(2 / 3, 48.5, 12.5) < 1 / 8);
});

test('a row already at the certification bound is not sub-gate', () => {
  assert.equal(subGate([row({ n: 60, ne: 55 })]).length, 0); // (55 + ½) / 61 ≥ 1 − 1/λ
});

test('the band is ranked by bits, so the per-partition reading cap keeps the strongest evidence', () => {
  const out = subGate([row({ pid: 'auto.imp:a', bits: 2, ne: 50 }), row({ pid: 'auto.imp:b', bits: 40, ne: 45 }), row({ pid: 'auto.imp:c', bits: 9 })]);
  assert.deepEqual(out.map(r => r.pid), ['auto.imp:b', 'auto.imp:c', 'auto.imp:a']);
});

// ----- mine(): a local absence is contrasted with the rest of its partition -----
const scopes = (dir, n, used) => Array.from({ length: n }, (_, k) => ({ kind: 'method', rel: `${dir}/f${k}.ts`, name: `m${k}`, line: 1, preds: { 'auto.call:rmSync': k < used ? 'true' : 'false' } }));
const absences = ps => mine(ps, { assign: new Map(), amb: new Set() }, () => 1, [], null, null, {}).facts
  .filter(f => f.cid.startsWith('d[') && f.pid === 'auto.call:rmSync' && f.exp === 'false').map(f => f.cid);

test('a directory that never does what the rest of its partition often does certifies an absence', () => {
  // 30 scopes under a/ never call rmSync; 30 of the 60 elsewhere do. The partition-wide rate is 33% — under the old
  // floor that passed by luck of the number; the contrast passes it on the evidence.
  const ps = [...scopes('p/a', 30, 0), ...scopes('p/b', 30, 15), ...scopes('p/c', 30, 15)];
  assert.ok(absences(ps).includes('d[p/a]:method'), JSON.stringify(absences(ps)));
});

test('a directory absence is certified by contrast even where the thing is rare partition-wide', () => {
  // 25% partition-wide: the old 30% floor refused it; 0 of 30 against 30 of 90 elsewhere is a real boundary
  const ps = [...scopes('p/a', 30, 0), ...scopes('p/b', 45, 15), ...scopes('p/c', 45, 15)];
  assert.ok(absences(ps).includes('d[p/a]:method'), JSON.stringify(absences(ps)));
});

test('a directory that uses the thing no less than the rest of its partition is not an absence', () => {
  // a/ calls it in 3 of 30 (10%); elsewhere 2 of 60 (3%) — a/ is not avoiding it, the thing is rare everywhere
  const ps = [...scopes('p/a', 30, 3), ...scopes('p/b', 30, 1), ...scopes('p/c', 30, 1)];
  assert.ok(!absences(ps).includes('d[p/a]:method'), JSON.stringify(absences(ps)));
});
