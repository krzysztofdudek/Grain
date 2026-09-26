// grain selftest --cochange — the co-change cell measured prospectively and under its null (docs/validation.md,
// "Co-change partners, prospective"). The protocol of the maintainer note *obligations-design* §2, rebuilt: the
// model is learned from the oldest part of the retained footprints and scored on the newest, never on the commits
// it was learned from. For every file of a held-out commit of 2 to 40 files, the cell names at most three partners
// and they are compared with the files the commit really touched. The curveball null (selftest-null.mjs) then
// counts how many partners the same cell names on a history whose commits keep their sizes and whose files keep
// their commit counts but no longer belong together; every one of those is false by construction.
import { cochangeData } from './completeness.mjs';
import { aggregatesOf, curveball, rng } from './selftest-null.mjs';

// the share of the retained footprints the model is learned from; the rest is scored
const TRAIN_SHARE = 0.8;

// a model carrying only what the co-change cell reads
const cellModel = Hx => ({ cochange: Hx.cochange, nonMegaCommits: Hx.nonMegaCommits, pathsAll: [], filesAll: [] });

// the arms: the shipped cell, and the null that names the three files the training window touched most
function arms(Hx) {
  const m = cellModel(Hx);
  const memo = new Map();
  const cell = f => {
    if (!memo.has(f)) memo.set(f, cochangeData(m, [f]).filter(h => !h.ambient).map(h => h.file));
    return memo.get(f);
  };
  const hot = Object.entries(Hx.fileCommits)
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .map(([f]) => f);
  return { cell, hot };
}
// every (edited file, partner) pair the cell names over one history, dead partners included: the cell is measured,
// not the rendering
function namedPairs(Hx) {
  const { cell } = arms(Hx);
  const files = new Set();
  for (const c of Hx.cochange) files.add(c.a).add(c.b);
  let n = 0;
  for (const f of files) n += cell(f).length;
  return n;
}
export function cochangeEval({ H, runs = 3, seed = 1 }) {
  const fps = H && H.fps ? H.fps : [];
  const cut = Math.floor(fps.length * TRAIN_SHARE);
  const T = aggregatesOf(fps.slice(0, cut));
  const { cell, hot } = arms(T);
  const score = () => ({ cases: 0, named: 0, hit3: 0, first: 0, nonObvCases: 0, nonObvHit3: 0 });
  const acc = { cell: score(), hottest: score() };
  for (const fp of fps.slice(cut)) {
    if (fp.files.length < 2 || fp.files.length > 40) continue;
    for (const f of fp.files) {
      const truth = new Set(fp.files.filter(x => x !== f));
      const others = hot.filter(x => x !== f);
      const hot10 = new Set(others.slice(0, 10));
      const nonObv = [...truth].filter(x => !hot10.has(x));
      for (const [arm, top] of [
        ['cell', cell(f).slice(0, 3)],
        ['hottest', others.slice(0, 3)],
      ]) {
        const r = acc[arm];
        r.cases++;
        if (top.length) r.named++;
        if (top.some(x => truth.has(x))) r.hit3++;
        if (top.length && truth.has(top[0])) r.first++;
        if (nonObv.length) {
          r.nonObvCases++;
          if (top.some(x => nonObv.includes(x))) r.nonObvHit3++;
        }
      }
    }
  }
  const rate = (a, b) => (b ? +(a / b).toFixed(3) : null);
  const out = { footprints: fps.length, train: cut, cases: acc.cell.cases, runs, seed, arms: {} };
  for (const [arm, r] of Object.entries(acc))
    out.arms[arm] = {
      hit3: rate(r.hit3, r.cases),
      nonObviousHit3: rate(r.nonObvHit3, r.nonObvCases),
      precision1: rate(r.first, r.named),
      named: rate(r.named, r.cases),
    };
  // the null, over every retained footprint, like `selftest --null`'s co-change family
  const nulls = [];
  if (fps.length) for (let r = 0; r < runs; r++) nulls.push(namedPairs(aggregatesOf(curveball(fps, rng(seed + r)))));
  out.arms.cell.real = fps.length ? namedPairs(aggregatesOf(fps)) : 0;
  out.arms.cell.null = nulls;
  out.arms.cell.nullMean = nulls.length ? +(nulls.reduce((a, b) => a + b, 0) / nulls.length).toFixed(2) : null;
  return out;
}
