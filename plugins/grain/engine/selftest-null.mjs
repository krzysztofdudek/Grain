// grain engine · selftest --null — the false-certification counterpart of the mutation harness (dev and corpus use)
//
// The mutation harness asks whether a real deviation is caught; this asks the opposite question: how many claims
// does each family certify when the label it reads has been destroyed and every marginal kept? Each family is run
// on a randomisation that keeps what its own base rate is drawn from and breaks only the link it claims:
//
//   conventions,  the role labels, and the directory each scope is read in, are dealt out again within (partition,
//   directories   scope kind) — group and directory sizes survive, the scope-to-group and scope-to-directory links do
//                 not; and the predicates of the assigned scopes of each kind are dealt out again across partitions,
//                 which a lone group (contrasted with the other partitions' assigned scopes) needs, since relabelling
//                 inside its partition cannot move it; a certified role or directory cell is then false by construction
//   architecture  the out-edge SETS are dealt out again among the files that have one — each file keeps a real
//                 set of imports and each module keeps its number of importing files, but not its own imports
//   obligations,  the commit × file incidence is swap-randomised (curveball trades between two commits), so every
//   co-change,    commit keeps its size and every file its number of commits; a file's birth flag and its touched
//   archetypes    scopes travel with the file
//   bridge        the message tokens are dealt out again among the commits
//   value norms   in each value container, each member is given to as many declaring files as carried it, at random
//   deviation     the fix flags are dealt out again among every modification event of the history, so each scope
//   fix rate      keeps its edit count and the repository its fix count
//
// The history families are counted twice over the SAME footprints — once as recorded, once randomised — and both
// aggregates are rebuilt from those footprints, so a real count and a null count always come from one population
// (the shipped bridge reads aggregates over every commit, the footprints keep the newest `fpsCap`).
// Nothing here is used by a query: it costs two learn passes per run (the role and directory null, then the value and
// fix-label null), and is meant for the corpus.
import { CFG } from './config.mjs';
import { architectureNorms } from './arch.mjs';
import { applyChangeArchetypes, applyMsgAffinity } from './commit-log.mjs';
import { cochangeData } from './completeness.mjs';
import { learn } from './learn.mjs';
import { buildObligationTable } from './obligations.mjs';
import { capCochange } from './facts.mjs';
import { refineModOf } from './relations.mjs';

const PAIR = '\u0000';
// a small seeded generator: the same seed gives the same randomisations, so a null count can be re-run exactly
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const shuffle = (xs, rnd) => {
  for (let j = xs.length - 1; j > 0; j--) {
    const r = Math.floor(rnd() * (j + 1));
    [xs[j], xs[r]] = [xs[r], xs[j]];
  }
  return xs;
};
// curveball swap randomisation of the commit × file matrix (Strona et al. 2014): two commits trade a random share
// of the files only one of them holds, which keeps every row sum and every column sum. Each file carries its own
// birth flag and the scope keys the commit touched in it. `CFG.nullTrades` trades per commit: at 5, a file in one of
// the few large commits of a history of mostly one-file commits rarely left it (Slim, sinatra); counts are flat from 20.
export function curveball(fps, rnd, trades = CFG.nullTrades * fps.length) {
  const rows = fps.map(fp => {
    const m = new Map();
    for (const f of fp.files) m.set(f, { added: false, scopes: [] });
    for (const f of fp.added || []) if (m.has(f)) m.get(f).added = true;
    for (const k of fp.scopes || []) {
      const f = k.slice(0, k.indexOf('#'));
      if (m.has(f)) m.get(f).scopes.push(k);
    }
    return m;
  });
  if (rows.length >= 2)
    for (let t = 0; t < trades; t++) {
      const i = Math.floor(rnd() * rows.length);
      let j = Math.floor(rnd() * (rows.length - 1));
      if (j >= i) j++;
      const A = rows[i],
        B = rows[j];
      const onlyA = [...A.keys()].filter(f => !B.has(f)),
        onlyB = [...B.keys()].filter(f => !A.has(f));
      if (!onlyA.length || !onlyB.length) continue;
      const pool = shuffle([...onlyA, ...onlyB], rnd);
      const toA = new Set(pool.slice(0, onlyA.length));
      const moved = [];
      for (const f of onlyA) if (!toA.has(f)) moved.push([f, A.get(f), A, B]);
      for (const f of onlyB) if (toA.has(f)) moved.push([f, B.get(f), B, A]);
      for (const [f, v, from, to] of moved) {
        from.delete(f);
        to.set(f, v);
      }
    }
  return fps.map((fp, i) => {
    const files = [...rows[i].keys()].sort();
    return {
      ...fp,
      files,
      added: files.filter(f => rows[i].get(f).added),
      scopes: files.flatMap(f => rows[i].get(f).scopes).sort(),
    };
  });
}
// the aggregates history.mjs keeps beside the footprints, rebuilt from the footprints alone, with the same caps
export function aggregatesOf(fps) {
  const fileCommits = {},
    fileOthers = {},
    msgAff = {},
    msgTokCommits = {},
    pairSup = new Map();
  for (const fp of fps) {
    for (const f of fp.files) {
      fileCommits[f] = (fileCommits[f] || 0) + 1;
      fileOthers[f] = (fileOthers[f] || 0) + fp.files.length - 1;
    }
    for (const t of fp.toks || []) {
      const m = (msgAff[t] ||= {});
      for (const f of fp.files) m[f] = (m[f] || 0) + 1;
      msgTokCommits[t] = (msgTokCommits[t] || 0) + 1;
    }
    if (fp.files.length < 2) continue;
    for (let i = 0; i < fp.files.length; i++)
      for (let j = i + 1; j < fp.files.length; j++) {
        const k = fp.files[i] + PAIR + fp.files[j];
        pairSup.set(k, (pairSup.get(k) || 0) + 1);
      }
  }
  const cochange = [];
  for (const [k, sup] of pairSup) {
    if (sup < CFG.cochangeMinSup) continue;
    const [a, b] = k.split(PAIR);
    cochange.push({ a, b, sup, commitsA: fileCommits[a], commitsB: fileCommits[b], othersA: fileOthers[a], othersB: fileOthers[b] });
  }
  const fileTouches = fps.reduce((a, fp) => a + fp.files.length, 0);
  // the pairs a model keeps (learn() caps them the same way), so the null pays the co-change index cost over the
  // same number of pairs as the shipped cell
  return { fps, fileCommits, msgAff, msgTokCommits, msgAffEx: {}, nonMegaCommits: fps.length, fileTouches, cochange: capCochange(cochange) };
}
// what each history family certifies over one set of footprints
function historyCounts(model, Hx) {
  const refinedM = model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || [], model.srcRoots || []));
  const live = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
  const obligations = buildObligationTable(Hx.fps, { refinedM, live }).reduce((a, o) => a + o.rules.length, 0);
  const tmpA = { ...model, changeArchetypes: [] };
  applyChangeArchetypes(tmpA, Hx);
  const archetypes = tmpA.changeArchetypes.reduce((a, c) => a + c.cells.filter(x => x.certified).length, 0);
  const tmpB = {};
  applyMsgAffinity(tmpB, Hx, model.filesAll || []);
  const bridge = tmpB.msgAffinity.reduce((a, r) => a + r.files.length, 0);
  // co-change: every (edited file, partner) pair a single-file `completeness` would name as specific, not ambient
  const tmpC = { ...model, cochange: Hx.cochange, nonMegaCommits: Hx.nonMegaCommits, fileTouches: Hx.fileTouches };
  const inPairs = new Set();
  for (const c of Hx.cochange) inPairs.add(c.a).add(c.b);
  let cochange = 0;
  for (const f of inPairs) cochange += cochangeData(tmpC, [f]).filter(h => !h.ambient && !h.dead).length;
  return { obligations, archetypes, bridge, cochange };
}
const archCounts = norms => ({
  arch: norms.length,
  archAbsence: norms.filter(n => n.exp === 'false').length,
});
const costFacts = model => model.partitions.reduce((a, p) => a + p.facts.filter(f => f.cost).length, 0);
const cellFacts = (model, re) => model.partitions.reduce((a, p) => a + p.facts.filter(f => re.test(f.cid)).length, 0);
const ROLE = /^r\d/,
  DIR = /^d\[/;
// the out-edge sets of the files that have one, dealt out again among those same files
export function permuteEdgeSources(edges, rnd) {
  const srcs = [...new Set(edges.map(e => e.from))].sort();
  const perm = shuffle(srcs.slice(), rnd);
  const to = new Map(srcs.map((f, i) => [f, perm[i]]));
  return edges.map(e => ({ ...e, from: to.get(e.from) })).filter(e => e.from !== e.to);
}
export async function nullTest({ model, H, learnArgs, runs = 3, seed = 1, log = () => {} }) {
  const families = ['conventions', 'directories', 'arch', 'archAbsence', 'obligations', 'cochange', 'archetypes', 'bridge', 'valueNorms', 'deviationFix'];
  const real = {
    conventions: cellFacts(model, ROLE),
    directories: cellFacts(model, DIR),
    ...archCounts(model.archNorms || []),
    valueNorms: Object.keys(model.valueNorms || {}).length,
    deviationFix: costFacts(model),
  };
  const fps = H && H.fps ? H.fps : [];
  if (fps.length) Object.assign(real, historyCounts(model, aggregatesOf(fps)));
  const nulls = Object.fromEntries(families.map(f => [f, []]));
  for (let r = 0; r < runs; r++) {
    const rnd = rng(seed + r);
    log(`[null] run ${r + 1}/${runs}: role and directory null (one learn pass)`);
    const { model: mr } = await learn({ ...learnArgs, H, nullLabels: rnd });
    nulls.conventions.push(cellFacts(mr, ROLE));
    nulls.directories.push(cellFacts(mr, DIR));
    log(`[null] run ${r + 1}/${runs}: value and fix-label null (one learn pass)`);
    const { model: mo } = await learn({ ...learnArgs, H, nullOutcomes: rnd });
    nulls.valueNorms.push(Object.keys(mo.valueNorms || {}).length);
    nulls.deviationFix.push(H ? costFacts(mo) : 0);
    const an = archCounts(architectureNorms({ ...model, edges: permuteEdgeSources(model.edges || [], rnd) }));
    nulls.arch.push(an.arch);
    nulls.archAbsence.push(an.archAbsence);
    if (fps.length) {
      const Hc = aggregatesOf(curveball(fps, rnd));
      const hc = historyCounts(model, Hc);
      for (const k of ['obligations', 'cochange', 'archetypes']) nulls[k].push(hc[k]);
      const toks = shuffle(fps.map(fp => fp.toks || []), rnd);
      const Hb = aggregatesOf(fps.map((fp, i) => ({ ...fp, toks: toks[i] })));
      nulls.bridge.push(historyCounts(model, Hb).bridge);
    }
  }
  const out = { runs, seed, footprints: fps.length, families: {} };
  for (const f of families) {
    if (real[f] === undefined) continue;
    const xs = nulls[f];
    out.families[f] = {
      real: real[f],
      null: xs,
      nullMean: xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : null,
      nullMax: xs.length ? Math.max(...xs) : null,
    };
  }
  // `archAbsence` is a subset of `arch`, so it is left out of the total
  out.nullTotalMean = +Object.entries(out.families)
    .filter(([k]) => k !== 'archAbsence')
    .reduce((a, [, v]) => a + (v.nullMean || 0), 0)
    .toFixed(2);
  return out;
}
