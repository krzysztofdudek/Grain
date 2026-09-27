// grain engine · query surface · `cochange` — which parts of a set change together, and how well a proposed cut
// follows the seams the history shows.
//
// `grain cochange [--files <path,…>] [--nodes <id,…>] [--level file|dir|node] [--partition <json>] [--graph <dir>]
// [--runs N] [--seed N] [--json]` emits `grain-cochange/1`. It is the architect's instrument for cutting a plan:
// given the files (or graph nodes) a piece of work touches, it names the certified co-change pairs among them and
// with the rest of the repository, and, given a proposed partition of them into parts, scores how much of the
// change traffic and of the imports stays inside a part against how much crosses between parts.
//
// THE UNIT OF COUNTING IS CHOSEN, NOT FIXED. `--level file` counts file pairs; `dir` counts the directories
// files sit in; `node` counts the architecture graph's own nodes, a file belonging to the deepest node whose
// mapping selects it (the ownership `advise` uses). File-level co-change is dominated by the busiest files of a
// repository, and a plan is cut in directories and nodes, so the coarser levels are the ones the architect reads;
// file level is kept for the case where the set is small.
//
// THE CERTIFICATION IS THE SHIPPED CO-CHANGE CELL, NOT A NEW ONE. A pair is named when, for at least one of its
// ends, the other end was touched in that end's commits more often than its own base rate predicts, by the same
// KT/BIC/index-cost contrast `completeness` applies (`partnerBits`, facts.mjs), with the base rate corrected for
// the size of the commits (issue 366). The counts behind it are recounted here per unit from the retained commit
// footprints (`H.fps`), because nothing in the model counts how many commits touched a directory or a node; at
// file level the recount reproduces the per-file counts the model keeps for the same window.
//
// THE CONTROL IS PART OF THE ANSWER. Every run recounts the same pairs on `--runs` swap-randomised copies of the
// unit-by-commit matrix (the curveball null `selftest --null` uses: every commit keeps its size, every unit its
// commit count, and nothing else survives), and reports how many pairs the cell still certifies there — each of
// them false by construction — beside the real count. A partition's score comes with the same score for random
// cuts of the same files into parts of the same sizes, dealt out a directory at a time, so a reader can see
// whether the proposed cut beats a cut that follows the directory tree and nothing else.
import { CFG } from './config.mjs';
import { cochangeIdxCost, currentPathOf, partnerBits } from './facts.mjs';
import { typeEvidence, purityOf } from './propose-levels.mjs';
import { curveball, rng } from './selftest-null.mjs';

export const COCHANGE_SCHEMA = 'grain-cochange/1';
export const LEVELS = ['file', 'dir', 'node'];
const PAIR = '\x00';

// ==================================================================================================
// 1. Scopes: a list of node ids and paths, resolved to the files they hold.
// ==================================================================================================
//
// An entry is a node id when the graph has one by that name — the node and every node under it, since a node
// id names a territory — and otherwise a path: the file itself, or every file under the directory. An entry
// that selects nothing is returned in `unknown` rather than dropped, so a misspelt scope is refused instead of
// measured as empty.
export const splitList = v =>
  v === undefined || v === null || v === true
    ? []
    : String(v)
        .split(',')
        .map(s => s.trim().replace(/^\.\//, '').replace(/\/+$/, ''))
        .filter(Boolean);
export function subtreeFiles(g, id) {
  const out = new Set();
  for (const n of g.nodes) if (n.id === id || n.id.startsWith(id + '/')) for (const f of n.files) out.add(f);
  return out;
}
export function resolveScope(entries, { files, g }) {
  const out = new Set();
  const parts = [];
  const unknown = [];
  for (const e of entries) {
    let sel;
    let kind;
    if (g && g.byId.has(e)) {
      sel = subtreeFiles(g, e);
      kind = 'node';
    } else {
      sel = new Set(e === '.' ? files : files.filter(f => f === e || f.startsWith(e + '/')));
      kind = 'path';
    }
    if (!sel.size) {
      unknown.push(e);
      continue;
    }
    for (const f of sel) out.add(f);
    parts.push({ entry: e, kind, files: sel.size });
  }
  return { files: out, entries: parts, unknown };
}

// ==================================================================================================
// 2. Units and their footprints.
// ==================================================================================================
//
// `unitOf(currentPath)` names the unit a live file belongs to at the chosen level, or null. A footprint's files are
// the paths the commit touched as they were then; each is carried to the path it lives at today first, and a
// file that is gone counts toward no unit (the question is about the code as it is now).
export function unitResolver(level, { g, live }) {
  if (level === 'file') return f => (live.has(f) ? f : null);
  if (level === 'dir')
    return f => {
      if (!live.has(f)) return null;
      const i = f.lastIndexOf('/');
      return i < 0 ? '.' : f.slice(0, i);
    };
  if (level === 'node') return f => (live.has(f) && g ? g.ownerOf.get(f) || null : null);
  throw new Error(`--level takes one of ${LEVELS.join(', ')} (got ${level})`);
}
export function unitFootprints(fps, unitOf, live) {
  const cur = currentPathOf(fps, live);
  let dropped = 0;
  const out = [];
  for (const fp of fps) {
    const units = new Set();
    for (const f of fp.files || []) {
      const u = unitOf(cur(f));
      if (u === null) dropped++;
      else units.add(u);
    }
    out.push({ sha: fp.sha, ts: fp.ts, files: [...units].sort() });
  }
  return { ufps: out, droppedTouches: dropped };
}
// The aggregates the co-change cell reads, per unit, over one list of unit footprints: how many commits touched
// each unit, how many other units those commits touched beside it (the commit-size base rate), how often each
// pair met, and the population. A commit that touched no unit adds nothing to any count but still belongs to the
// population, as it does for files.
export function unitAggregates(ufps) {
  const commits = new Map(),
    others = new Map(),
    sup = new Map();
  let touches = 0;
  for (const fp of ufps) {
    const us = fp.files;
    touches += us.length;
    for (const u of us) {
      commits.set(u, (commits.get(u) || 0) + 1);
      others.set(u, (others.get(u) || 0) + us.length - 1);
    }
    if (us.length < 2) continue;
    for (let i = 0; i < us.length; i++)
      for (let j = i + 1; j < us.length; j++) {
        const k = us[i] + PAIR + us[j];
        sup.set(k, (sup.get(k) || 0) + 1);
      }
  }
  return { commits, others, sup, N: ufps.length, touches };
}
// Every pair above the support floor with at least one end in `focus` (all pairs when `focus` is null), and the
// directional reading of the cell for each end. A pair is certified when either direction clears it.
export function certifiedPairs(agg, focus = null) {
  const kept = [...agg.sup].filter(([, s]) => s >= CFG.cochangeMinSup);
  const idx = cochangeIdxCost(kept.length);
  const out = [];
  for (const [k, s] of kept) {
    const [a, b] = k.split(PAIR);
    if (focus && !focus.has(a) && !focus.has(b)) continue;
    const ca = agg.commits.get(a) || 0,
      cb = agg.commits.get(b) || 0;
    // a → b: of a's commits, how often b was touched, against b's own rate over commits of a's size
    const ab = partnerBits(s, ca, cb, agg.N, idx, agg.others.get(a) || 0, agg.touches);
    const ba = partnerBits(s, cb, ca, agg.N, idx, agg.others.get(b) || 0, agg.touches);
    if (ab === null && ba === null) continue;
    out.push({ a, b, sup: s, commitsA: ca, commitsB: cb, bitsAB: ab, bitsBA: ba });
  }
  return out.sort(
    (p, q) =>
      Math.max(q.bitsAB ?? 0, q.bitsBA ?? 0) - Math.max(p.bitsAB ?? 0, p.bitsBA ?? 0) ||
      q.sup - p.sup ||
      (p.a < q.a ? -1 : p.a > q.a ? 1 : p.b < q.b ? -1 : 1)
  );
}
// The null: the same count on swap-randomised copies of the unit-by-commit matrix. Every pair it certifies is false.
export function nullCertified(ufps, focus, { runs, seed }) {
  const counts = [];
  for (let r = 0; r < runs; r++) {
    const shuffled = curveball(ufps, rng(seed + r));
    counts.push(certifiedPairs(unitAggregates(shuffled), focus).length);
  }
  return {
    runs,
    seed,
    certifiedMean: runs ? +(counts.reduce((a, b) => a + b, 0) / runs).toFixed(2) : null,
    certifiedMax: runs ? Math.max(...counts) : null,
  };
}

// ==================================================================================================
// 3. A partition, scored.
// ==================================================================================================
//
// `parts` maps a part name to its file set. Three readings, each a match against a miss:
//   - commits: of the retained commits that touched any part, how many touched exactly one (inside) against
//     two or more (crossing). This is the plan-cutting question: would the history's changes have stayed in one
//     part of this cut?
//   - imports: resolved imports with both ends in the parts, inside one part against between two.
//   - certified pairs: the co-change cell's own pairs between the parts' units, inside one part against between two.
export function partOfFile(parts) {
  const m = new Map();
  const clash = new Set();
  for (const [name, set] of Object.entries(parts))
    for (const f of set) {
      if (m.has(f) && m.get(f) !== name) clash.add(f);
      m.set(f, name);
    }
  return { partOf: m, overlap: [...clash].sort() };
}
export function partitionScore(parts, { edges, fps, live, pairs, unitFilesOf }) {
  const { partOf } = partOfFile(parts);
  let impIn = 0,
    impX = 0;
  for (const e of edges) {
    const a = partOf.get(e.from),
      b = partOf.get(e.to);
    if (a === undefined || b === undefined) continue;
    if (a === b) impIn += e.n || 1;
    else impX += e.n || 1;
  }
  let cIn = null,
    cX = null;
  if (fps) {
    cIn = 0;
    cX = 0;
    const cur = currentPathOf(fps, live);
    for (const fp of fps) {
      const touched = new Set();
      for (const f of fp.files || []) {
        const p = partOf.get(cur(f));
        if (p !== undefined) touched.add(p);
      }
      if (touched.size === 1) cIn++;
      else if (touched.size > 1) cX++;
    }
  }
  let pIn = null,
    pX = null;
  if (pairs) {
    pIn = 0;
    pX = 0;
    for (const p of pairs) {
      const pa = partsOfUnit(unitFilesOf(p.a), partOf),
        pb = partsOfUnit(unitFilesOf(p.b), partOf);
      if (!pa.size || !pb.size) continue;
      if (pa.size === 1 && pb.size === 1 && [...pa][0] === [...pb][0]) pIn++;
      else pX++;
    }
  }
  const share = (i, x) => (i === null || i + x === 0 ? null : +(i / (i + x)).toFixed(4));
  return {
    commitsInside: cIn,
    commitsCrossing: cX,
    commitShare: share(cIn, cX),
    importsInside: impIn,
    importsCrossing: impX,
    importShare: share(impIn, impX),
    pairsInside: pIn,
    pairsCrossing: pX,
  };
}
const partsOfUnit = (files, partOf) => {
  const s = new Set();
  for (const f of files) {
    const p = partOf.get(f);
    if (p !== undefined) s.add(p);
  }
  return s;
};
// Random cuts of the same files into parts of the same sizes, dealt out one directory at a time: every file of a
// directory lands in the same part, directories are shuffled, and each part is filled in turn up to its size. The
// control a proposed cut must beat is a cut that respects the directory tree and knows nothing else.
export function randomCuts(parts, rnd) {
  const names = Object.keys(parts);
  const sizes = names.map(n => parts[n].size);
  const all = [...new Set(names.flatMap(n => [...parts[n]]))].sort();
  const byDir = new Map();
  for (const f of all) {
    const i = f.lastIndexOf('/');
    const d = i < 0 ? '.' : f.slice(0, i);
    if (!byDir.has(d)) byDir.set(d, []);
    byDir.get(d).push(f);
  }
  const dirs = [...byDir.keys()];
  for (let j = dirs.length - 1; j > 0; j--) {
    const r = Math.floor(rnd() * (j + 1));
    [dirs[j], dirs[r]] = [dirs[r], dirs[j]];
  }
  const out = Object.fromEntries(names.map(n => [n, new Set()]));
  let k = 0;
  for (const d of dirs) {
    while (k < names.length - 1 && out[names[k]].size >= sizes[k]) k++;
    for (const f of byDir.get(d)) out[names[k]].add(f);
  }
  return out;
}
export function partitionControl(parts, ctx, { runs, seed }) {
  const scores = [];
  for (let r = 0; r < runs; r++) scores.push(partitionScore(randomCuts(parts, rng(seed + r)), ctx));
  const mean = key => {
    const xs = scores.map(s => s[key]).filter(x => x !== null);
    return xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(4) : null;
  };
  return { runs, seed, commitShareMean: mean('commitShare'), importShareMean: mean('importShare'), scores };
}

// ==================================================================================================
// 4. The document.
// ==================================================================================================
//
// `parsePartition` takes the `--partition` value: a JSON object written inline, or the path of a file holding one
// (resolved against the working directory). Each value is a list of node ids and paths, resolved like `--nodes`
// and `--files`.
export function parsePartition(raw, readFile) {
  const text = String(raw).trim();
  let doc;
  try {
    doc = JSON.parse(text.startsWith('{') ? text : readFile(text));
  } catch (e) {
    throw new Error(`--partition takes a JSON object of part name → list of node ids and paths, inline or in a file: ${e.message}`);
  }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc) || !Object.keys(doc).length)
    throw new Error('--partition takes a JSON object with at least one part: {"part": ["src/a", "node/id"], …}');
  for (const [k, v] of Object.entries(doc))
    if (!Array.isArray(v) || !v.every(x => typeof x === 'string'))
      throw new Error(`--partition: part "${k}" must be a list of node ids and paths`);
  return doc;
}
export function cochangeDocument({ model, head, g, H, level, fileEntries, nodeEntries, partition, runs, seed }) {
  const live = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
  const files = [...live].sort();
  if (level === 'node' && !g) throw new Error('--level node needs an architecture graph — this repository has no `.yggdrasil/` (or pass --graph)');
  if (nodeEntries.length && !g) throw new Error('--nodes needs an architecture graph — this repository has no `.yggdrasil/` (or pass --graph)');
  const notNodes = g ? nodeEntries.filter(n => !g.byId.has(n)) : [];
  if (notNodes.length) throw new Error(`--nodes: no node ${notNodes.map(n => `\`${n}\``).join(', ')} in the graph`);
  const sel = resolveScope([...nodeEntries, ...fileEntries], { files, g });
  if (sel.unknown.length) throw new Error(`nothing tracked matches ${sel.unknown.map(e => `\`${e}\``).join(', ')}`);
  let parts = null,
    overlap = [];
  if (partition) {
    parts = {};
    for (const [name, entries] of Object.entries(partition)) {
      const r = resolveScope(entries.map(e => e.replace(/^\.\//, '').replace(/\/+$/, '')), { files, g });
      if (r.unknown.length) throw new Error(`--partition: part "${name}": nothing tracked matches ${r.unknown.map(e => `\`${e}\``).join(', ')}`);
      parts[name] = r.files;
      for (const f of r.files) sel.files.add(f);
    }
    overlap = partOfFile(parts).overlap;
    if (overlap.length)
      throw new Error(`--partition: a file may belong to one part only; ${overlap.length} belong to more (${overlap.slice(0, 3).join(', ')}${overlap.length > 3 ? ', …' : ''})`);
  }
  if (!sel.files.size) throw new Error('usage: grain cochange needs --files, --nodes or --partition — the set to read');
  const unitOf = unitResolver(level, { g, live });
  const setUnits = new Set();
  for (const f of sel.files) {
    const u = unitOf(f);
    if (u !== null) setUnits.add(u);
  }
  const unitFiles = new Map();
  for (const f of files) {
    const u = unitOf(f);
    if (u === null) continue;
    if (!unitFiles.has(u)) unitFiles.set(u, []);
    unitFiles.get(u).push(f);
  }
  const unitFilesOf = u => unitFiles.get(u) || [];
  const tracked = new Set(files);
  const edges = (model.edges || []).filter(e => tracked.has(e.from) && tracked.has(e.to));
  const mined = new Set();
  for (const p of model.partitions || []) for (const f of p.files || []) mined.add(f);
  const evCtx = { edges, cochange: [], mined, ruleSites: [] };
  const fps = H && Array.isArray(H.fps) ? H.fps : null;
  let pairs = null,
    control = null,
    window = null,
    agg = null;
  if (fps) {
    const { ufps, droppedTouches } = unitFootprints(fps, unitOf, live);
    agg = unitAggregates(ufps);
    pairs = certifiedPairs(agg, setUnits).map(p => ({ ...p, inside: setUnits.has(p.a) && setUnits.has(p.b) }));
    control = { null: nullCertified(ufps, setUnits, { runs, seed }), real: pairs.length };
    window = {
      commits: fps.length,
      first: fps.length ? fps[0].sha : null,
      last: fps.length ? fps[fps.length - 1].sha : null,
      touchesOutsideAnyUnit: droppedTouches,
    };
  }
  const shown = m => ({
    files: m.files,
    importsInside: m.importsInside,
    importsCrossing: m.importsCrossing,
    purity: purityOf(m) === null ? null : +purityOf(m).toFixed(3),
    mined: m.mined,
  });
  const units = [...setUnits].sort().map(u => ({
    unit: u,
    commits: agg ? agg.commits.get(u) || 0 : null,
    evidence: shown(typeEvidence(new Set(unitFilesOf(u)), evCtx)),
  }));
  let partitionDoc = null;
  if (parts) {
    const ctx = { edges, fps, live, pairs, unitFilesOf };
    const score = partitionScore(parts, ctx);
    const ctl = partitionControl(parts, { ...ctx, pairs: null }, { runs: Math.max(runs, 1) * 10, seed });
    const beaten = key => (score[key] === null ? null : ctl.scores.filter(s => s[key] !== null && s[key] >= score[key]).length);
    partitionDoc = {
      parts: Object.entries(parts).map(([name, set]) => ({ name, ...shown(typeEvidence(set, evCtx)) })),
      score,
      control: {
        runs: ctl.runs,
        seed: ctl.seed,
        commitShareMean: ctl.commitShareMean,
        importShareMean: ctl.importShareMean,
        atLeastAsGoodCommitShare: beaten('commitShare'),
        atLeastAsGoodImportShare: beaten('importShare'),
      },
    };
  }
  return {
    schema: COCHANGE_SCHEMA,
    repo: '.',
    at: head || null,
    level,
    set: { entries: sel.entries, files: sel.files.size, units: setUnits.size },
    units,
    pairs,
    control,
    partition: partitionDoc,
    window,
    ...(fps ? {} : { note: 'no history: co-change was not counted (--no-history, a shallow clone or no git) — only the import side is reported' }),
  };
}

// ==================================================================================================
// 5. The command and its text.
// ==================================================================================================
export async function cmdCochange({ model, head, root, args, opts, stamp, store, isGit }, deps) {
  if (args.length) throw new Error('usage: grain cochange [--files <path,…>] [--nodes <id,…>] [--level file|dir|node] [--partition <json|file>] [--graph <dir>] [--runs N] [--seed N] [--json] — takes no positional arguments');
  const { readNodeGraph, graphRootOf, loadHistory, readFile, log } = deps;
  const nodeEntries = splitList(opts.nodes);
  const fileEntries = splitList(opts.files);
  const graphRoot = graphRootOf(root, opts);
  const live = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
  const g = readNodeGraph(graphRoot, [...live].sort());
  const level = opts.level && opts.level !== true ? String(opts.level) : nodeEntries.length ? 'node' : 'file';
  if (!LEVELS.includes(level)) throw new Error(`--level takes one of ${LEVELS.join(', ')} (got ${level})`);
  const partition = opts.partition && opts.partition !== true ? parsePartition(opts.partition, readFile) : null;
  const runs = opts.runs === undefined ? 3 : Math.max(0, Math.floor(+opts.runs) || 0);
  const seed = opts.seed === undefined ? 1 : Math.floor(+opts.seed) || 1;
  let H = null;
  if (isGit && !opts['no-history']) {
    try {
      H = (await loadHistory({ gitdir: root, store, log })).H;
    } catch (e) {
      log('history unavailable for cochange: ' + e.message);
    }
  }
  const doc = cochangeDocument({ model, head, g, H, level, fileEntries, nodeEntries, partition, runs, seed });
  if (opts.json) return [JSON.stringify(doc, null, 1)];
  return [...cochangeText(doc), stamp()];
}
export function cochangeText(doc) {
  const out = [];
  const lvl = { file: 'file', dir: 'directory', node: 'node' }[doc.level];
  const lvls = { file: 'files', dir: 'directories', node: 'nodes' }[doc.level];
  out.push(`${doc.set.files} file${doc.set.files === 1 ? '' : 's'} in ${doc.set.units} ${doc.set.units === 1 ? lvl : lvls}, counted at the ${lvl} level.`);
  if (!doc.pairs) out.push(doc.note);
  else {
    const inside = doc.pairs.filter(p => p.inside),
      outside = doc.pairs.filter(p => !p.inside);
    const w = doc.window;
    out.push(`Over the last ${w.commits} commits, ${doc.pairs.length} pair${doc.pairs.length === 1 ? '' : 's'} change together more often than chance: ${inside.length} inside the set, ${outside.length} with the rest of the repository.`);
    const c = doc.control;
    if (c.null.runs)
      out.push(`  For scale: the same count on ${c.null.runs} shuffled cop${c.null.runs === 1 ? 'y' : 'ies'} of this history names ${c.null.certifiedMean} a run (at most ${c.null.certifiedMax}), every one of them false.`);
    const line = p => {
      const dir = [p.bitsAB !== null ? `${p.sup} of ${p.commitsA} for ${p.a}` : null, p.bitsBA !== null ? `${p.sup} of ${p.commitsB} for ${p.b}` : null].filter(Boolean).join(', ');
      return `  - ${p.a} ↔ ${p.b}: together in ${p.sup} commits (${dir})`;
    };
    for (const p of inside.slice(0, 10)) out.push(line(p));
    if (inside.length > 10) out.push(`  … and ${inside.length - 10} more inside the set.`);
    for (const p of outside.slice(0, 10)) out.push(line(p));
    if (outside.length > 10) out.push(`  … and ${outside.length - 10} more with the rest of the repository.`);
  }
  if (doc.partition) {
    const s = doc.partition.score,
      c = doc.partition.control;
    out.push(`The proposed cut into ${doc.partition.parts.length} part${doc.partition.parts.length === 1 ? '' : 's'}:`);
    if (s.commitShare !== null)
      out.push(`  ${s.commitsInside} of ${s.commitsInside + s.commitsCrossing} commits that touched a part stayed inside one part (random cuts along the directory tree: ${pct(c.commitShareMean)}; ${c.atLeastAsGoodCommitShare} of ${c.runs} did at least as well).`);
    if (s.importShare !== null)
      out.push(`  ${s.importsInside} of ${s.importsInside + s.importsCrossing} imports between the parts' files stay inside one part (random cuts: ${pct(c.importShareMean)}; ${c.atLeastAsGoodImportShare} of ${c.runs} did at least as well).`);
    else out.push('  No resolved import runs between the parts\' files.');
    if (s.pairsInside !== null) out.push(`  ${s.pairsInside} of the pairs above sit inside one part, ${s.pairsCrossing} cross between parts.`);
  }
  return out;
}
const pct = x => (x === null || x === undefined ? 'n/a' : `${Math.round(x * 100)}%`);
