// The oracle score reads the proposal and the accepted graph as two partitions of the same files (issue 263).
//
// A best-match Jaccard cannot tell a proposal that cuts along the accepted graph's seams at a coarser level from
// one that cuts across them: both miss. The two conditional entropies can, and this pins that they move the way
// their definitions say on planted graphs: splitting every proposed node in two across the accepted seams raises
// H(P|A) and leaves H(A|P) where it was; merging the proposed nodes raises H(A|P) and does not raise H(P|A). The
// accepted tree is read at each depth, and a proposal that is exactly the accepted tree cut at depth 1 is found
// there with VI 0. Relations are projected by file majority, so an accepted relation whose ends have no Jaccard
// partner is still scored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compare, ownership, partitionScore, projectedRelations } from '../engine/oracle-partition.mjs';

const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
const node = (id, files, relations = []) => ({ id, files, relations: relations.map(target => ({ target })) });

// four accepted leaves of 10 files under two parents that map nothing themselves
const accepted = {
  nodes: [
    node('a', [], []),
    node('a/x', range(0, 10), ['b/z', 'a/y']),
    node('a/y', range(10, 20), ['b/w']),
    node('b', [], []),
    node('b/z', range(20, 30)),
    node('b/w', range(30, 40)),
  ],
};
// the proposal cuts exactly at the accepted tree's first level
const coarse = { nodes: [node('p1', range(0, 20), ['p2']), node('p2', range(20, 40))] };
const even = xs => xs.filter(f => f % 2 === 0),
  odd = xs => xs.filter(f => f % 2 === 1);
// every proposed node split in two ACROSS the accepted seams (by parity, which no accepted node follows)
const split = {
  nodes: [
    node('p1e', even(range(0, 20))),
    node('p1o', odd(range(0, 20))),
    node('p2e', even(range(20, 40))),
    node('p2o', odd(range(20, 40))),
  ],
};
// every proposed node merged into one
const merged = { nodes: [node('all', range(0, 40))] };

test('a proposal that is a coarsening of the accepted graph: H(P|A) = 0, H(A|P) = 1 bit, VI 0 at depth 1', () => {
  const s = partitionScore(coarse, accepted);
  assert.equal(s.filesOwned.both, 40);
  assert.equal(s.leaves.hPgivenA, 0);
  assert.equal(s.leaves.hAgivenP, 1);
  assert.equal(s.leaves.inversePurity, 1, 'every accepted leaf sits inside one proposed node');
  assert.deepEqual(s.lowestVI, { depth: 1, vi: 0, nmi: 1, ari: 1 });
});

test('splitting every proposed node in two raises H(P|A) and leaves H(A|P) where it was', () => {
  const before = partitionScore(coarse, accepted).leaves,
    after = partitionScore(split, accepted).leaves;
  assert.ok(after.hPgivenA > before.hPgivenA, `H(P|A) ${before.hPgivenA} -> ${after.hPgivenA}`);
  assert.equal(after.hPgivenA, 1);
  assert.equal(after.hAgivenP, before.hAgivenP, `H(A|P) ${before.hAgivenP} -> ${after.hAgivenP}`);
});

test('merging the proposed nodes raises H(A|P) and does not raise H(P|A)', () => {
  const before = partitionScore(coarse, accepted).leaves,
    after = partitionScore(merged, accepted).leaves;
  assert.ok(after.hAgivenP > before.hAgivenP, `H(A|P) ${before.hAgivenP} -> ${after.hAgivenP}`);
  assert.equal(after.hAgivenP, 2);
  assert.ok(after.hPgivenA <= before.hPgivenA);
});

test('a file belongs to the deepest node that maps it; the information measures are symmetric where they must be', () => {
  const o = ownership([node('src', range(0, 4)), node('src/core', [2, 3])]);
  assert.deepEqual([...o].sort((x, y) => x[0] - y[0]), [[0, 'src'], [1, 'src'], [2, 'src/core'], [3, 'src/core']]);
  const x = ['a', 'a', 'b', 'b'],
    y = ['c', 'd', 'c', 'd'];
  const xy = compare(x, y),
    yx = compare(y, x);
  assert.equal(xy.vi, yx.vi);
  assert.equal(xy.hPgivenA, yx.hAgivenP);
  assert.equal(xy.nmi, 0, 'independent labelings share no information');
});

test('accepted relations are projected by file majority, so none leaves the denominator', () => {
  const r = projectedRelations(coarse, accepted);
  assert.equal(r.acceptedDeclared, 3);
  assert.equal(r.acceptedCollapsed, 1, 'a/x -> a/y falls inside p1');
  assert.equal(r.acceptedUnmappable, 0);
  assert.equal(r.acceptedPairs, 1, 'a/x -> b/z and a/y -> b/w are both p1 -> p2');
  assert.equal(r.overlap, 1);
  assert.equal(r.recall, 1);
  assert.equal(r.precision, 1);
});
