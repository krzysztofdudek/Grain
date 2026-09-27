// Issue 393: `grain selftest` on Grain's own repository reported one false alarm, and the alarm was real product
// output, not a harness artefact. `grain check` on a file of the go name-resolution matrix said, about its
// `nodeOf` method, BOTH "methods never call `filePath.split`" (a deviation) and "methods here call
// `filePath.split` (100% of 29)" (conforms). The first came from a partition-wide fact whose lead surface is a
// different call (`byPath.get`) and which carries `filePath.split` as a SIBLING surface; the second from the
// more specific cell that governs `filePath.split` for that scope. The specificity rule already decided which of
// the two speaks for that call on that scope, and the sibling overruled it.
//
// A sibling surface is now silent where a more specific fact governs its own pid; everywhere else it still
// speaks, so a scope with no such fact is still accused through the sibling.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkFile } from '../engine/core.mjs';

const src = `
function nodeOf(filePath) {
  const segs = filePath.split('/');
  return segs.length >= 2 ? segs[segs.length - 2] : '';
}
`;
const vocab = { NT: [], CALL: ['byPath.get', 'filePath.split'], IMP: [], EXT: [], SHAPE: [], DECO: [], RET: [], PT: [], DNT: null, ENT: null, RNT: null, PNT: null, LEX: {} };
const fact = (cid, pid, exp, sraw, extra = {}) => ({
  cid, kind: 'method', pid, exp, counts: { [exp]: sraw }, srawCounts: { [exp]: sraw }, alphabet: [exp], raw: sraw, sraw,
  share: 1, bpi: 1, exemplars: [{ rel: 'other/x.mjs', line: 1, name: 'x' }], deviantsN: 0, deviants: [], held: null, ...extra,
});
// partition-wide: methods never call `byPath.get`, and — a sibling surface with the same conform set — never call `filePath.split`
const wide = fact('_all:method', 'auto.call:byPath.get', 'false', 100, {
  nSurfaces: 2,
  siblings: [{ pid: 'auto.call:filePath.split', exp: 'false', counts: { false: 100 }, srawCounts: { false: 100 }, alphabet: ['false'] }],
});
// the directory the file sits in: methods here DO call `filePath.split`
const local = fact('d[matrix]:method', 'auto.call:filePath.split', 'true', 29);
const modelWith = facts => ({ pkgs: ['.'], partitions: [{ name: '_repo', vocab, medoids: [], assignments: {}, facts }] });
const run = (facts, rel) => checkFile({ model: modelWith(facts), root: process.cwd(), rel, content: src, exemplarOk: () => true });

test('a sibling surface does not accuse a scope whose own, more specific cell says the opposite (issue 393)', async () => {
  const r = await run([wide, local], 'matrix/case.test.mjs');
  assert.deepEqual(r.msgs.filter(m => m.scope === 'nodeOf').map(m => m.pid), []);
  // the specific cell is what governs that call for this scope, and the scope conforms to it
  const g = r.governed.find(x => x.scope === 'nodeOf' && x.pid === 'auto.call:filePath.split');
  assert.ok(g && g.conforms && g.fact.cid === 'd[matrix]:method');
});

test('where no more specific fact governs the pid, the sibling surface still speaks (issue 393)', async () => {
  const r = await run([wide, local], 'elsewhere/case.test.mjs'); // outside `matrix/`: the directory cell does not apply
  const m = r.msgs.find(x => x.scope === 'nodeOf');
  assert.ok(m, 'the partition-wide sibling must still flag the call');
  assert.equal(m.pid, 'auto.call:filePath.split');
  assert.equal(m.factKey, '_all:method|auto.call:byPath.get');
});

test('a tie in specificity goes to the fact that governs the pid, so no contradictory pair is printed (issue 396)', async () => {
  // two partition-wide facts of the same evidence class: one carries `filePath.split` as a sibling ("never"), the
  // other governs it as its lead ("here call"). Before, the tie let the sibling speak beside the governing fact.
  const wideTied = { ...wide, sraw: 29, raw: 29, counts: { false: 29 }, srawCounts: { false: 29 } };
  const lead = fact('_all:method#2', 'auto.call:filePath.split', 'true', 29);
  for (const facts of [[wideTied, lead], [lead, wideTied]]) {
    const r = await run(facts, 'elsewhere/case.test.mjs');
    assert.deepEqual(r.msgs.filter(m => m.scope === 'nodeOf').map(m => m.pid), []);
    const g = r.governed.find(x => x.scope === 'nodeOf' && x.pid === 'auto.call:filePath.split');
    assert.ok(g && g.conforms && g.fact === lead);
  }
});

// Issue 399, the other direction: the sibling surface belongs to the MORE specific fact, and the pid it carries is the
// lead surface of a LESS specific one that governs that pid for the scope. Before, both spoke: the directory cell's
// sibling said "methods here never call `filePath.split`" while the partition-wide fact counted the same call as
// conforming to "methods call `filePath.split`" — or, where both said the same, the scope was accused twice. The
// specificity rule gives the pid to the more specific fact, so its sibling speaks and the wider fact stands down.
test('a more specific fact\'s sibling surface speaks for its pid; the less specific fact governing that pid stands down (issue 399)', async () => {
  // the directory the file sits in: methods here never call `byPath.get` — and, a sibling surface, never `filePath.split`
  const localWithSibling = fact('d[matrix]:method', 'auto.call:byPath.get', 'false', 29, {
    nSurfaces: 2,
    siblings: [{ pid: 'auto.call:filePath.split', exp: 'false', counts: { false: 29 }, srawCounts: { false: 29 }, alphabet: ['false'] }],
  });
  // partition-wide: methods call `filePath.split`
  const wideLead = fact('_all:method', 'auto.call:filePath.split', 'true', 100);
  for (const facts of [[localWithSibling, wideLead], [wideLead, localWithSibling]]) {
    const r = await run(facts, 'matrix/case.test.mjs');
    const onSplit = r.msgs.filter(m => m.scope === 'nodeOf' && m.pid === 'auto.call:filePath.split');
    assert.equal(onSplit.length, 1, JSON.stringify(r.msgs));
    assert.equal(onSplit[0].factKey, 'd[matrix]:method|auto.call:byPath.get', 'the directory cell speaks, through its sibling');
    const opposite = r.governed.filter(x => x.scope === 'nodeOf' && x.pid === 'auto.call:filePath.split');
    assert.deepEqual(opposite.map(x => x.fact.cid), [], 'no "conforms to" from the wider fact on the pid the specific cell already decided');
  }
  // outside `matrix/` the directory cell does not apply, so the partition-wide fact governs and speaks as before
  const r = await run([localWithSibling, wideLead], 'elsewhere/case.test.mjs');
  assert.deepEqual(r.msgs.filter(m => m.scope === 'nodeOf').map(m => m.pid), []);
  const g = r.governed.find(x => x.scope === 'nodeOf' && x.pid === 'auto.call:filePath.split');
  assert.ok(g && g.conforms && g.fact === wideLead);
});

test('where the more specific sibling and the wider lead agree, the scope is accused once, not twice (issue 399)', async () => {
  const localWithSibling = fact('d[matrix]:method', 'auto.call:byPath.get', 'false', 29, {
    nSurfaces: 2,
    siblings: [{ pid: 'auto.call:filePath.split', exp: 'false', counts: { false: 29 }, srawCounts: { false: 29 }, alphabet: ['false'] }],
  });
  const wideNever = fact('_all:method', 'auto.call:filePath.split', 'false', 100);
  const r = await run([localWithSibling, wideNever], 'matrix/case.test.mjs');
  const onSplit = r.msgs.filter(m => m.scope === 'nodeOf' && m.pid === 'auto.call:filePath.split');
  assert.equal(onSplit.length, 1, JSON.stringify(r.msgs));
  assert.equal(onSplit[0].factKey, 'd[matrix]:method|auto.call:byPath.get');
});
