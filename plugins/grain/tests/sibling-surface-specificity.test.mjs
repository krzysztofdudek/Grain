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
