// issue 357 — a commit-archetype cell is certified by a test the clustering never saw. The clustering picks its
// members because they share cells, so the contrast of a cell inside the shape against the whole history is paid on
// the evidence that selected it; on a swap-randomised history it certified about as many cells as on the real one.
// `conditionalCellBits` asks instead, over every footprint that carries the shape's other cells in files of their
// own, whether the remaining files carry this cell more often than as many files drawn at random from the history's
// touches that carry no anchor cell would.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conditionalCellBits } from '../engine/commit-log.mjs';
import { rng } from '../engine/selftest-null.mjs';

// a footprint is a list of files, each with the cells it carries
const fp = (...files) => ({ files: files.map(([f]) => f), cells: files });
function world(fps) {
  const fpFiles = new Map();
  for (const x of fps) fpFiles.set(x, new Map(x.cells.map(([f, cs]) => [f, new Set(cs)])));
  return { fpFiles };
}
const IDX = 3;

test('a shape whose cells all live in one file has no anchor and certifies nothing', () => {
  const fps = Array.from({ length: 20 }, (_, i) => fp([`src/a/f${i % 4}.ts`, ['m:src/a', 'k:ts']]));
  const w = world(fps);
  assert.equal(conditionalCellBits('m:src/a', ['m:src/a', 'k:ts'], fps, fps, w.fpFiles, IDX), null);
  assert.equal(conditionalCellBits('k:ts', ['m:src/a', 'k:ts'], fps, fps, w.fpFiles, IDX), null);
});

test('two places that change together, and rarely apart, certify each other', () => {
  const together = Array.from({ length: 12 }, (_, i) => fp([`src/h/h${i}.ts`, ['m:src/h']], [`test/h${i}.test.ts`, ['m:test']]));
  const alone = Array.from({ length: 30 }, (_, i) => fp([`src/o/o${i}.ts`, ['m:src/o']]));
  const fps = [...together, ...alone];
  const w = world(fps);
  const r = conditionalCellBits('m:test', ['m:src/h', 'm:test'], together, fps, w.fpFiles, IDX);
  assert.equal(r.k, 12);
  assert.equal(r.n, 12);
  assert.ok(r.q < 0.3, `a random file carries m:test at ${r.q}`);
  assert.ok(r.bits > 0, JSON.stringify(r));
});

test('a cell that big commits touch by chance is not certified: the expectation grows with the files left over', () => {
  // every commit touches 9 files drawn at random from 10 modules; half of them also touch the anchor. m:m0 rides
  // along in half the anchor commits because the commits are big, not because it goes with the anchor
  const rnd = rng(7);
  const fps = [];
  for (let i = 0; i < 80; i++) {
    const files = i < 40 ? [[`src/anchor/a${i}.ts`, ['m:src/anchor']]] : [];
    for (let j = 0; j < 9; j++) {
      const m = Math.floor(rnd() * 10);
      files.push([`src/m${m}/x${i}_${j}.ts`, [`m:m${m}`]]);
    }
    fps.push(fp(...files));
  }
  const w = world(fps);
  const members = fps.slice(0, 40).filter(x => [...w.fpFiles.get(x).values()].some(cs => cs.has('m:m0')));
  const r = conditionalCellBits('m:m0', ['m:src/anchor', 'm:m0'], members, fps, w.fpFiles, IDX);
  assert.ok(r.k / r.n >= 0.5, `m:m0 rides along in half the anchor commits: ${JSON.stringify(r)}`);
  assert.ok(r.q > 0.5, `and nine random files would carry it about as often: ${JSON.stringify(r)}`);
  assert.ok(r.bits <= 0, JSON.stringify(r));
});

test('a module the anchor shares a file with earns nothing from that file, and a commit of anchor files alone is not evidence', () => {
  // the shape's members all touch one file carrying both m:src/core and g:core#0, plus a test; the test half is
  // the only other place, so m:src/core's anchor is the test cell alone, not its own role group
  const members = Array.from({ length: 10 }, (_, i) => fp([`src/core/c${i}.ts`, ['m:src/core', 'g:core#0']], [`test/c${i}.test.ts`, ['m:test']]));
  const noise = [
    ...Array.from({ length: 30 }, (_, i) => fp([`test/t${i}.test.ts`, ['m:test']])),
    ...Array.from({ length: 30 }, (_, i) => fp([`src/other/o${i}.ts`, ['m:src/other']])),
  ];
  const fps = [...members, ...noise];
  const w = world(fps);
  const r = conditionalCellBits('m:src/core', ['m:src/core', 'g:core#0', 'm:test'], members, fps, w.fpFiles, IDX);
  // the 30 test-only commits carry the anchor but have no file left over, so they say nothing either way
  assert.equal(r.n, 10);
  assert.equal(r.k, 10);
  assert.ok(r.bits > 0, JSON.stringify(r));
});

test('the remaining files are compared with the files that could remain: a suffix left over once the anchor is set aside earns nothing', () => {
  // two suffixes only: every commit touches random .py and .rst files. Given a .py anchor, the remaining files are
  // all .rst by construction, and 1 − (1 − p)^s with p over ALL touches would call that a co-change
  const rnd = rng(3);
  const fps = [];
  for (let i = 0; i < 200; i++) {
    const files = [];
    const size = 1 + Math.floor(rnd() * 4);
    for (let j = 0; j < size; j++) files.push(rnd() < 0.7 ? [`src/p${i}_${j}.py`, ['k:py']] : [`docs/r${i}_${j}.rst`, ['k:rst']]);
    fps.push(fp(...files));
  }
  const w = world(fps);
  const members = fps.filter(x => [...w.fpFiles.get(x).values()].some(cs => cs.has('k:py')) && [...w.fpFiles.get(x).values()].some(cs => cs.has('k:rst')));
  const r = conditionalCellBits('k:rst', ['k:py', 'k:rst'], members, fps, w.fpFiles, IDX);
  assert.equal(r.k, r.n, 'whatever is left over is an .rst file');
  assert.ok(r.q > 0.99, `and so it is expected to be: ${JSON.stringify(r)}`);
  assert.ok(r.bits <= 0, JSON.stringify(r));
});
