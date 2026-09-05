// too-much.mjs — "which parts of this code do too much", from the one objective and nothing else.
//
// ONE definition, no per-category threshold. For an element e (a scope, a file, a module) and a dimension d,
// the dimension yields an integer statistic t_d(e); the element's OWN partition supplies the reference
// population; the statistic is coded through the binary-magnitude alphabet bin(t) = floor(log2(1+t)); the
// fitted distribution is the KT predictive the engine already uses for every categorical convention
// (`kt` is imported from engine/core.mjs verbatim, so the arithmetic here cannot drift from mining's);
// and the pointwise codelength excess is
//
//     excess(e) = log2( kt(counts_-e, K, modeBin, n-1) / kt(counts_-e, K, bin(t(e)), n-1) )
//
// which is the SAME expression `core.mjs` computes for a deviation's gap, with the convention's expected
// value replaced by the population's modal bin. It fires on the SAME bound: excess >= log2(lambda) = 3 bits,
// one-sided (bin above the mode only — "too much", not "too little"). No constant is introduced: lambda=8
// and CFG.minRaw=5 are the engine's own, and the log2 binning is the standard universal code for an
// integer's magnitude, i.e. "excess is measured in doublings" — the only scale-free reading of "too much".
//
// The counts EXCLUDE the element under test (`counts_-e`, n-1), which is what "pointwise" means for a
// sequential KT predictive: the codelength of x_e given x_{-e}. `core.mjs`'s deviation gap leaves the deviant
// inside its cell because a convention's population runs to hundreds and one instance does not move it; here
// a population can be five files, where a god-file left inside its own bin pays itself 1.6 bits of immunity.
// Same code, correct conditioning. K is sized from the FULL population so the alphabet cannot change per
// element.
//
// A population below CFG.minRaw elements is SILENT and disclosed by name; no default distribution is ever
// substituted for a population too small to fit. CFG.minRaw = 5 is not a second floor here — it is exactly the
// point where the bound becomes reachable: the largest excess attainable in a population of n is log2(2n-1),
// so clearing log2(lambda) at all needs n >= (lambda+1)/2 = 4.5. A population that IS fitted but whose
// concentration still cannot reach 3 bits is reported as underpowered, not silently absent.
// "Too much" is relative to THIS repo's practice: the modal bin is printed for every dimension, so a
// repository where every file is a god-file visibly flags nothing.
//
// usage: node too-much.mjs <repo> <out.json> [--md] [--export <json>] [--top N] [--quiet] [--no-history]
//   --export <path>  reuse an existing `grain export` JSON instead of spawning one
//   --top N          rows per category in the printed report (default 10)
//
// Reads, beyond the export: <repo>/.grain/cache/model.json (partition file lists, per-file scope inventory
// with line ranges, and the role assignment map including its -1 ambiguity marker — the export carries
// group members capped at 200 per group and no partition file list) and <repo>/.grain/cache/history.json
// (per-commit footprints, for churn and co-change breadth — the export publishes only pair rows above
// cochangeMinSup). Zero engine changes.
import { execFileSync } from 'node:child_process';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CFG } from '../../engine/config.mjs';
import { kt } from '../../engine/core.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(here, '..', '..', 'bin', 'grain.mjs');

export const LAMBDA_BITS = Math.log2(CFG.lambda); // 3 bits — the one loss constant, unchanged
const r2 = x => +x.toFixed(2);

// ---------------------------------------------------------------------------------------------------
// the one test
// ---------------------------------------------------------------------------------------------------

/** binary magnitude of a non-negative integer: the alphabet the excess is coded over. 0->0, 1->1, 2,3->2, 4..7->3 */
export function logBin(t) {
  return Math.floor(Math.log2(1 + Math.max(0, t)));
}

/**
 * Fit the KT predictive over the binary-magnitude alphabet of one reference population.
 * `values` is every element's statistic in that population. The alphabet (and therefore K) is derived once
 * from the whole population; the counts an individual element is judged against exclude that element itself.
 * Returns null when the population is below CFG.minRaw: silence, never a substituted default.
 */
export function fitBins(values) {
  if (!values || values.length < CFG.minRaw) return null;
  const counts = Object.create(null);
  for (const v of values) {
    const b = logBin(v);
    counts[b] = (counts[b] || 0) + 1;
  }
  const bins = Object.keys(counts).map(Number).sort((a, b) => a - b);
  const n = values.length;
  const K = bins.length + 1; // + the unseen sentinel, exactly as a convention's alphabet is sized
  let modeBin = bins[0];
  for (const b of bins) if (counts[b] > counts[modeBin]) modeBin = b;
  // THE NORM. A deviation in grain can only fire where a convention was CERTIFIED, and a convention is
  // certified only when its expected value clears the KT display bound (docs/mathematics.md, "Naming an
  // expected value"): (ne + 1/2) / (neff + K/2) >= 1 - 1/lambda. The ordinal analogue of "the expected value"
  // for a size, a degree or a commit count is not one bin but a PREFIX of bins — the norm is "at most this
  // big" — so the same bound is applied one-sidedly to the cumulative mass, with a single 1/2 for the
  // aggregated event (the conservative reading: it under-counts the prefix and so pushes normBin up).
  // normBin is the smallest bin whose prefix clears it; nothing at or below it can be excessive.
  //
  // This is what bounds the fire rate without a tuning knob: the norm covers at least 1 - 1/lambda = 7/8 of
  // the population by construction, so at most 1/lambda = 12.5% of any population is even ELIGIBLE to fire,
  // and the 3-bit excess then cuts further. A population so spread that no prefix clears the bound has
  // normBin = its largest bin and says nothing at all — exactly as an uncertified cell says nothing.
  let cum = 0, normBin = bins[bins.length - 1];
  for (const b of bins) {
    cum += counts[b];
    if ((cum + 0.5) / (n + K / 2) >= 1 - 1 / CFG.lambda) { normBin = b; break; }
  }
  // the most any one member of THIS population could cost. An element above the mode is not in the modal bin,
  // so the modal count survives leave-one-out intact and the ceiling is exact: log2((c_mode + 0.5) / 0.5).
  // Bounded above by log2(2n-1) — the reason CFG.minRaw = 5 is where log2(lambda) = 3 first becomes reachable.
  const attainableBits = Math.log2((counts[modeBin] + 0.5) / 0.5);
  return { counts, bins, n, K, modeBin, normBin, normMass: r2(cum / n), attainableBits };
}

/**
 * Pointwise codelength excess of one statistic against a fitted population, in bits: the cost of coding this
 * element's bin under the predictive fitted on the OTHER members, relative to coding the modal bin there.
 * One-sided by the meaning of "too much": a statistic at or below the modal bin costs 0.
 */
export function excessBits(fit, t) {
  if (!fit) return 0;
  const b = logBin(t);
  if (b <= fit.modeBin || b <= fit.normBin) return 0; // inside the norm: no convention to deviate from
  const loo = { ...fit.counts };
  loo[b] = (loo[b] || 1) - 1;
  if (!loo[b]) delete loo[b];
  const n = fit.n - 1;
  if (n < 1) return 0;
  return Math.log2(kt(loo, fit.K, fit.modeBin, n) / kt(loo, fit.K, b, n));
}

export const fires = bits => bits >= LAMBDA_BITS;

/** Shannon entropy, in bits, of a weight map. */
export function entropyBits(weights) {
  const tot = [...weights.values()].reduce((a, b) => a + b, 0);
  if (tot <= 0) return 0;
  let h = 0;
  for (const w of weights.values()) {
    if (w <= 0) continue;
    const p = w / tot;
    h -= p * Math.log2(p);
  }
  return h;
}

// ---------------------------------------------------------------------------------------------------
// inputs
// ---------------------------------------------------------------------------------------------------

export function loadCache(repo) {
  try {
    return JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * The exact per-file scope inventory at HEAD: `tree.json` is keyed `<blob sha>|<path>` and holds only current
 * files (a rename or delete drops out), uncapped. The model's own `part.fileScopes` is capped at 200 scopes per
 * file, which saturates precisely on the files this instrument exists to rank — so the cap is read around here,
 * and the model copy is only the fallback (a repository indexed without git writes `scopes.json` instead).
 * Returns Map(rel -> [{ kind, name, line, endLine }]) or null.
 */
export function loadTree(repo) {
  let raw;
  try {
    raw = JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'tree.json'), 'utf8'));
  } catch {
    return null;
  }
  const out = new Map();
  for (const [k, v] of Object.entries(raw)) {
    const rel = k.slice(k.indexOf('|') + 1);
    const list = (v?.s || []).map(s => ({ kind: s.kind, name: s.name, line: s.line, endLine: s.endLine ?? s.line }));
    out.set(rel, list);
  }
  return out.size ? out : null;
}

/**
 * Stream the per-commit footprints out of the NDJSON history state. Only the `fps` rows are read, and only
 * their `files`/`renames` — everything else in that file is irrelevant here and is skipped without parsing
 * cost beyond one JSON.parse per line (the format is one JSON value per line by construction).
 */
export async function loadFootprints(repo) {
  const path = join(repo, '.grain', 'cache', 'history.json');
  const fps = [];
  try {
    const rl = createInterface({ input: createReadStream(path, { encoding: 'utf8' }), crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line || line[0] !== '[') continue;
      const row = JSON.parse(line);
      if (row[0] === 'a' && row[1] === 'fps') fps.push({ files: row[2].files || [], renames: row[2].renames || [] });
    }
  } catch {
    return null;
  }
  return fps.length ? fps : null;
}

/** historical path -> path at HEAD, the same forward-chase `core.mjs`'s currentPathOf performs. */
export function currentPath(fps, live) {
  const renamedTo = new Map();
  for (const fp of fps) for (const [o, n] of fp.renames || []) renamedTo.set(o, n);
  return rel => {
    let cur = rel;
    for (let i = 0; i < 20 && !live.has(cur) && renamedTo.has(cur); i++) cur = renamedTo.get(cur);
    return cur;
  };
}

// ---------------------------------------------------------------------------------------------------
// the dimensions
// ---------------------------------------------------------------------------------------------------
//
// Each entry: which rank of element it scores, the integer statistic, and the reference population.
// A dimension the model cannot express as a pointwise excess is NOT here — see the design doc for the three
// categories that are reported as ranked gains instead (duplication, twins, cycles) and for depth/arity,
// which grain's own `auto.arity` convention already accuses through the identical lambda bound.
export const DIMENSIONS = [
  { id: 'responsibilities', rank: 'file', statistic: 'bits the model spends coding which role group each of the file\'s scopes plays (n*H) \u2014 zero for a file of any size that plays one role' },
  { id: 'size', rank: 'file', statistic: 'scopes declared in the file' },
  { id: 'fanout', rank: 'file', statistic: 'distinct files it imports' },
  { id: 'fanin', rank: 'file', statistic: 'distinct files that import it' },
  { id: 'churn', rank: 'file', statistic: 'commits that touched it (mega-commits excluded, as the engine excludes them)' },
  { id: 'cochange-breadth', rank: 'file', statistic: 'distinct files it has ever changed together with' },
  { id: 'scope-size', rank: 'scope', statistic: 'lines the scope spans' },
  { id: 'multideviant', rank: 'scope', statistic: 'distinct conventions it fires a deviation on' },
  { id: 'mod-fanout', rank: 'module', statistic: 'distinct modules it depends on' },
  { id: 'mod-fanin', rank: 'module', statistic: 'distinct modules that depend on it' },
];

/**
 * Build every element's statistics, grouped by (dimension, population).
 * Returns { stats: Map<dimId, Map<popKey, Map<elemId, {t, ev}>>>, meta }.
 */
export function collectStatistics({ exp, cache, fps, tree = null }) {
  const partOf = new Map(); // file rel -> partition name
  const partFiles = new Map(); // partition -> [rel]
  for (const p of cache?.partitions || []) {
    partFiles.set(p.name, p.files || []);
    for (const rel of p.files || []) partOf.set(rel, p.name);
  }
  const live = new Set(cache?.filesAll || [...partOf.keys()]);

  const S = new Map(); // dimId -> popKey -> elemId -> { t, ev, repoKey }
  // `repoKey` names the SECOND, coarser population the same element is also judged in (the repo-wide level, the
  // analogue of mining's `_all:` cell). It is '_repo' for everything whose statistic is comparable across the
  // whole repository, and '_repo#<kind>' where it is not: a `case`, a `method` and a `class` do not share a
  // length distribution, exactly as no mined convention pools two `f.kind`s into one cell.
  const put = (dim, pop, id, t, ev, repoKey = '_repo') => {
    let byPop = S.get(dim);
    if (!byPop) S.set(dim, (byPop = new Map()));
    let byId = byPop.get(pop);
    if (!byId) byPop.set(pop, (byId = new Map()));
    byId.set(id, { t, ev: ev || null, repoKey });
  };

  // ---- per-file scope inventory + role spread (model cache: fileScopes, assignments, medoids) ----
  const fileScopeCount = new Map();
  const scopeSpans = []; // { rel, part, kind, name, line, endLine, t }
  for (const p of cache?.partitions || []) {
    const groupOfKey = p.assignments || {};
    const nGroups = (p.medoids || []).length;
    const nFiles = (p.files || []).length;
    const perFile = new Map(); // rel -> Map(groupId -> weight)
    const ambPerFile = new Map();
    for (const [k, r] of Object.entries(groupOfKey)) {
      const rel = k.slice(0, k.indexOf('#'));
      let m = perFile.get(rel);
      if (!m) perFile.set(rel, (m = new Map()));
      if (r === -1) {
        // ambiguous: mining credits it to no group and it is absent from every role fact's population.
        // It is not a group the file "plays"; it is counted as evidence of a seam and printed, not scored.
        ambPerFile.set(rel, (ambPerFile.get(rel) || 0) + 1);
        continue;
      }
      m.set(r, (m.get(r) || 0) + 1);
    }
    for (const rel of p.files || []) {
      const list = tree?.get(rel)
        ? tree.get(rel)
        : (p.fileScopes?.[rel] || []).map(([kind, name, line, endLine]) => ({ kind, name, line, endLine: endLine ?? line }));
      if (!list.length) continue;
      fileScopeCount.set(rel, list.length);
      for (const s of list)
        scopeSpans.push({ rel, part: p.name, kind: s.kind, name: s.name, line: s.line, endLine: s.endLine, t: s.endLine - s.line + 1 });
    }
    // size (file): every file of the partition, including the ones with no scope at all
    for (const rel of p.files || []) {
      const list = tree?.get(rel) || [];
      const byKind = new Map();
      for (const s of list) byKind.set(s.kind, (byKind.get(s.kind) || 0) + 1);
      const widest = list.reduce((a, s) => (a && a.endLine - a.line >= s.endLine - s.line ? a : s), null);
      put('size', p.name, rel, fileScopeCount.get(rel) || 0, {
        byKind: [...byKind].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, n]) => ({ kind: k, n })),
        widest: widest ? { name: widest.name, kind: widest.kind, lines: widest.endLine - widest.line + 1 } : null,
        spannedLines: list.length ? Math.max(...list.map(s => s.endLine)) : 0,
      });
    }
    // responsibilities (file): only files with >= 2 assigned scopes have a spread to measure
    for (const rel of p.files || []) {
      const m = perFile.get(rel);
      const assigned = m ? [...m.values()].reduce((a, b) => a + b, 0) : 0;
      if (assigned < 2) continue;
      const H = entropyBits(m);
      const eff = Math.pow(2, H);
      // THE STATISTIC IS BITS, NOT A COUNT. `n*H` is what the model actually spends coding "which role each
      // scope in this file plays", and it is exactly the term the minimal cut below removes — so the dimension
      // is measured in the same currency as its own counterfactual. A count of distinct groups (or its
      // size-free cousin 2^H) is bounded above by the file's own scope count, which makes every small
      // heterogeneous file read as maximally multi-role — four scopes in four groups is "four responsibilities"
      // — and was measured to fire on nothing but tiny fixtures. A big SINGLE-role file still costs 0 here.
      put('responsibilities', p.name, rel, Math.round(assigned * H), {
        H: r2(H), effGroups: r2(eff), groups: m.size, assignedScopes: assigned,
        ambiguousScopes: ambPerFile.get(rel) || 0, partGroups: nGroups, partFiles: nFiles,
        byGroup: [...m].sort((a, b) => b[1] - a[1]).slice(0, 6)
          .map(([r2i, n]) => ({ group: 'r' + r2i, label: (p.medoids?.[r2i] || {}).label || null, n })),
      });
    }
  }
  // scope-size: population is the partition's scopes OF THE SAME KIND — a class and a method are not one another's
  // yardstick, exactly as every mined convention is scoped by `f.kind`.
  for (const s of scopeSpans)
    put('scope-size', s.part + '#' + s.kind, s.rel + '#' + s.kind + '#' + s.name, s.t,
      { line: s.line, endLine: s.endLine, kind: s.kind }, '_repo#' + s.kind);

  // ---- file fan-in / fan-out (export edges) ----
  const out = new Map(), inn = new Map();
  for (const e of exp.edges || []) {
    if (!e.from || !e.to || e.from === e.to) continue;
    (out.get(e.from) || out.set(e.from, new Set()).get(e.from)).add(e.to);
    (inn.get(e.to) || inn.set(e.to, new Set()).get(e.to)).add(e.from);
  }
  for (const [part, files] of partFiles)
    for (const rel of files) {
      const o = out.get(rel) || new Set();
      const i = inn.get(rel) || new Set();
      put('fanout', part, rel, o.size, { targets: [...o].slice(0, 8), byDir: topBy([...o].map(dirname)) });
      put('fanin', part, rel, i.size, { sources: [...i].slice(0, 8), byDir: topBy([...i].map(dirname)) });
    }

  // ---- churn + co-change breadth (history footprints) ----
  if (fps && fps.length) {
    const cur = currentPath(fps, live);
    const commits = new Map();
    const partners = new Map();
    for (const fp of fps) {
      const now = [...new Set(fp.files.map(cur))];
      for (const f of now) commits.set(f, (commits.get(f) || 0) + 1);
      if (now.length < 2) continue;
      for (const f of now) {
        let s = partners.get(f);
        if (!s) partners.set(f, (s = new Set()));
        for (const g of now) if (g !== f) s.add(g);
      }
    }
    for (const [part, files] of partFiles)
      for (const rel of files) {
        if (!commits.has(rel)) continue; // a file history has never seen has no churn population to join
        put('churn', part, rel, commits.get(rel), { commits: commits.get(rel) });
        put('cochange-breadth', part, rel, (partners.get(rel) || new Set()).size, {
          partners: (partners.get(rel) || new Set()).size, commits: commits.get(rel),
        });
      }
  }

  // ---- multi-deviant (scope): how many distinct conventions this scope fires on ----
  const governed = new Map(); // scopeId -> { part, rel, name, kind, fired:[], gov:0 }
  for (const c of exp.conventions || []) {
    const touch = (st, dev) => {
      const id = st.rel + '#' + st.kind + '#' + st.name;
      let g = governed.get(id);
      if (!g) governed.set(id, (g = { part: c.partition, rel: st.rel, kind: st.kind, name: st.name, line: st.line, fired: [], gov: 0 }));
      g.gov++;
      if (dev && dev.fires) g.fired.push({ convention: c.id, pid: c.feature?.enumerator ? c.feature.enumerator : c.id, observed: dev.observed, gapBits: dev.gapBits, phrase: dev.phrase });
    };
    for (const st of c.conformingSites || []) touch(st, null);
    for (const st of c.deviatingSites || []) touch(st, st);
  }
  for (const [id, g] of governed)
    put('multideviant', g.part, id, g.fired.length, {
      governedBy: g.gov, line: g.line, kind: g.kind, rel: g.rel,
      fired: g.fired.slice(0, 6), gapSum: r2(g.fired.reduce((a, f) => a + (f.gapBits || 0), 0)),
    });

  // ---- module fan-in / fan-out. A module's "own partition" is the module graph itself: modules are cut from
  // package roots, not from the style partition, so the graph is the only population they belong to.
  const mOut = new Map(), mIn = new Map();
  for (const e of exp.moduleGraph?.edges || []) {
    (mOut.get(e.from) || mOut.set(e.from, new Map()).get(e.from)).set(e.to, e.n);
    (mIn.get(e.to) || mIn.set(e.to, new Map()).get(e.to)).set(e.from, e.n);
  }
  for (const nd of exp.moduleGraph?.nodes || []) {
    const o = mOut.get(nd.id) || new Map();
    const i = mIn.get(nd.id) || new Map();
    put('mod-fanout', '_moduleGraph', nd.id, o.size, { files: nd.files, layer: nd.layer, targets: [...o].sort((a, b) => b[1] - a[1]).slice(0, 8) });
    put('mod-fanin', '_moduleGraph', nd.id, i.size, { files: nd.files, layer: nd.layer, sources: [...i].sort((a, b) => b[1] - a[1]).slice(0, 8) });
  }

  return { stats: S, partOf, partFiles, live, fileScopeCount };
}

function topBy(list) {
  const m = new Map();
  for (const x of list) m.set(x, (m.get(x) || 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, n]) => ({ key: k, n }));
}

// ---------------------------------------------------------------------------------------------------
// the counterfactual: what the minimal cut would save, where that is a compression gain at all
// ---------------------------------------------------------------------------------------------------

/**
 * responsibilities. Coding "which role each scope in this file plays" costs n*H bits under the file's own
 * mixture. Split along the role groups and that term is gone: each part declares one role (k*log2(G), G the
 * partition's role count) and the partition pays for k-1 new file identities at the same log2(#regions) price
 * `mdlCuts` pays per new region root. A negative gain means the cut does not pay — printed as such, never hidden.
 */
export function responsibilityCut(ev) {
  if (!ev) return null;
  const { H, assignedScopes: n, groups: k, partGroups: G, partFiles: F } = ev;
  if (!(k > 1) || !(G > 0)) return null;
  const before = n * H;
  const after = k * Math.log2(Math.max(2, G)) + (k - 1) * Math.log2(F + k);
  return { kind: 'split-by-role-group', parts: k, gainBits: r2(before - after), codedBefore: r2(before), codedAfter: r2(after) };
}

/** fan-out. The minimal cut is the single target DIRECTORY holding most of the out-edges; the gain is the drop in
 *  the very excess that flagged the file — the same code, one edge-group lighter. */
export function fanoutCut(fit, t, ev) {
  if (!fit || !ev || !ev.byDir?.length) return null;
  const biggest = ev.byDir[0];
  const after = Math.max(0, t - biggest.n);
  return {
    kind: 'move-or-front-the-heaviest-target', target: biggest.key, edgesMoved: biggest.n,
    gainBits: r2(excessBits(fit, t) - excessBits(fit, after)), degreeAfter: after,
  };
}

/** duplication. A template's members each carry the shared core; extracting it stores that core once.
 *  Bits per skeleton signature come from a KT code over the repo's OWN template-signature alphabet. */
export function templateGain(req, sigFit) {
  let b = 0;
  for (const [sig, cnt] of Object.entries(req || {})) b += cnt * -Math.log2(kt(sigFit.counts, sigFit.K, sig, sigFit.n));
  return b;
}

export function fitSignatures(exp) {
  const counts = Object.create(null);
  let n = 0;
  const eat = req => {
    for (const [sig, c] of Object.entries(req || {})) {
      counts[sig] = (counts[sig] || 0) + c;
      n += c;
    }
  };
  for (const p of exp.partitions || []) {
    for (const g of p.groups || []) eat(g.profile?.req);
    for (const t of p.templates || []) eat(t.req);
  }
  return { counts, n: Math.max(1, n), K: Object.keys(counts).length + 1 };
}

// ---------------------------------------------------------------------------------------------------
// the run
// ---------------------------------------------------------------------------------------------------

export function analyse({ exp, cache, fps, tree = null }) {
  const { stats, partFiles } = collectStatistics({ exp, cache, fps, tree });
  const sigFit = fitSignatures(exp);

  const dims = {};
  const elements = new Map(); // rank + ' ' + id -> element record
  const silent = [];
  const underpowered = [];

  for (const spec of DIMENSIONS) {
    const byPop = stats.get(spec.id) || new Map();
    // TWO LEVELS, the same two-level contrast `mine()` itself runs: a cell is judged inside its own context
    // AND against the partition-wide `_all:` cell. Here the local level is the element's own partition and the
    // repo level is every element of that rank in the repository. They are never summed — they are two codes
    // for the SAME statistic — so an element's excess on a dimension is the stronger of the two, and the row
    // records which level spoke. Module-rank dimensions have one population by construction (the module graph
    // is repo-global), so their two levels coincide and only the repo level is reported.
    const repoValues = new Map();
    for (const byId of byPop.values())
      for (const v of byId.values()) (repoValues.get(v.repoKey) || repoValues.set(v.repoKey, []).get(v.repoKey)).push(v.t);
    const repoFits = new Map();
    if (spec.rank !== 'module')
      for (const [rk, vals] of repoValues) {
        const f = fitBins(vals);
        if (!f) continue;
        repoFits.set(rk, f);
        if (f.attainableBits < LAMBDA_BITS)
          underpowered.push({
            dimension: spec.id, population: rk, elements: f.n, attainableBits: r2(f.attainableBits),
            reason: `the most any element of this rank can cost repo-wide is ${r2(f.attainableBits)} bits, under the ${r2(LAMBDA_BITS)} the bound demands`,
          });
      }
    let scored = 0, fired = 0, scoredPowered = 0, firedLocal = 0, firedRepo = 0;
    const modeValues = [];
    const rows = [];
    for (const [pop, byId] of byPop) {
      const fit = fitBins([...byId.values()].map(v => v.t));
      if (!fit)
        silent.push({ dimension: spec.id, population: pop, elements: byId.size, reason: `below CFG.minRaw=${CFG.minRaw} — no population to be excessive against` });
      else if (fit.attainableBits < LAMBDA_BITS)
        underpowered.push({
          dimension: spec.id, population: pop, elements: fit.n, attainableBits: r2(fit.attainableBits),
          reason: `the most any member of this population can cost is ${r2(fit.attainableBits)} bits, under the ${r2(LAMBDA_BITS)} the bound demands — fitted, and unable to speak`,
        });
      if (fit) modeValues.push({ pop, modeBin: fit.modeBin, modeRange: binRange(fit.modeBin), normBin: fit.normBin, normRange: 'at most ' + (Math.pow(2, fit.normBin + 1) - 2), normMass: fit.normMass, n: fit.n, attainableBits: r2(fit.attainableBits) });
      const localPowered = !!fit && fit.attainableBits >= LAMBDA_BITS;
      for (const [id, v] of byId) {
        const repoFit = repoFits.get(v.repoKey) || null;
        const repoPowered = !!repoFit && repoFit.attainableBits >= LAMBDA_BITS;
        scored++;
        if (localPowered || repoPowered) scoredPowered++;
        const localBits = fit ? excessBits(fit, v.t) : 0;
        const repoBits = repoFit ? excessBits(repoFit, v.t) : 0;
        const useLocal = localBits >= repoBits;
        const bits = Math.max(localBits, repoBits);
        if (!fires(bits)) continue;
        fired++;
        if (fires(localBits)) firedLocal++;
        if (fires(repoBits)) firedRepo++;
        const spoke = useLocal ? fit : repoFit;
        const cuts = [];
        if (spec.id === 'responsibilities') { const c = responsibilityCut(v.ev); if (c) cuts.push(c); }
        if (spec.id === 'fanout') { const c = fanoutCut(spoke, v.t, v.ev); if (c) cuts.push(c); }
        if (spec.id === 'multideviant' && v.ev?.gapSum)
          cuts.push({ kind: 'conform', conventions: v.ev.fired.length, gainBits: v.ev.gapSum });
        const row = {
          rank: spec.rank, dimension: spec.id, id, population: pop,
          level: spec.rank === 'module' ? 'repo' : useLocal ? 'partition' : 'repo',
          t: v.t, bin: logBin(v.t),
          modeBin: spoke.modeBin, modeRange: binRange(spoke.modeBin), normBin: spoke.normBin, normRange: 'at most ' + (Math.pow(2, spoke.normBin + 1) - 2), normMass: spoke.normMass, popSize: spoke.n,
          excessBits: r2(bits), localBits: r2(localBits), repoBits: r2(repoBits),
          evidence: v.ev, cuts,
        };
        rows.push(row);
        const key = spec.rank + ' ' + id;
        let el = elements.get(key);
        if (!el) elements.set(key, (el = { rank: spec.rank, id, population: pop, totalExcessBits: 0, dims: {} }));
        el.dims[spec.id] = { t: v.t, excessBits: r2(bits), level: row.level, norm: 'at most ' + (Math.pow(2, spoke.normBin + 1) - 2), popSize: spoke.n };
        el.totalExcessBits = r2(el.totalExcessBits + bits);
        if (cuts.length) (el.cuts ||= []).push(...cuts);
      }
    }
    rows.sort((a, b) => b.excessBits - a.excessBits || (a.id < b.id ? -1 : 1));
    dims[spec.id] = {
      rank: spec.rank, statistic: spec.statistic, populations: byPop.size, scored, scoredPowered, fired,
      firedAtPartitionLevel: firedLocal, firedAtRepoLevel: firedRepo,
      fireRate: scored ? r2(100 * fired / scored) : null,
      fireRatePowered: scoredPowered ? r2(100 * fired / scoredPowered) : null,
      repoModes: [...repoFits].map(([rk, f]) => ({ population: rk, modeBin: f.modeBin, modeRange: binRange(f.modeBin), normBin: f.normBin, normRange: 'at most ' + (Math.pow(2, f.normBin + 1) - 2), normMass: f.normMass, n: f.n, attainableBits: r2(f.attainableBits) })).sort((a, b) => b.n - a.n).slice(0, 6),
      modes: modeValues.sort((a, b) => b.n - a.n).slice(0, 6),
      rows,
    };
  }

  // ---- duplication and twins: ranked GAINS, not fired excesses (see the design doc: a template is repeated
  // by definition, so there is no population against which one is excessive; only the saving is computable).
  const duplication = [];
  for (const p of exp.partitions || []) {
    for (const g of p.groups || []) {
      const pf = g.profile;
      if (!pf || !pf.req || pf.n < 2) continue;
      const core = templateGain(pf.req, sigFit);
      duplication.push({
        what: 'role-group template', where: `${p.name}::${g.id}`, label: g.label || null, members: pf.n,
        sharedNodes: pf.shared, coverage: pf.coverage, holesPerInstance: (pf.perInstance || []).length,
        gainBits: r2((pf.n - 1) * core), coreBits: r2(core), skel: (pf.skel || '').slice(0, 140),
        directories: (g.directories || []).slice(0, 4),
      });
    }
    for (const t of p.templates || []) {
      if (!t.req || t.n < 2) continue;
      const core = templateGain(t.req, sigFit);
      duplication.push({
        what: 'residue template', where: p.name, label: t.kind || null, members: t.n,
        sharedNodes: t.shared, coverage: t.coverage, holesPerInstance: (t.perInstance || []).length,
        gainBits: r2((t.n - 1) * core), coreBits: r2(core), skel: (t.skel || '').slice(0, 140),
        exemplars: (t.exemplars || []).slice(0, 3).map(e => `${e.rel}:${e.line}`),
      });
    }
  }
  duplication.sort((a, b) => b.gainBits - a.gainBits);

  // a twin names its side as (partition, role INDEX); the export's group ids are that index prefixed with `r`
  const profileOfRef = (part, role) => {
    const p = (exp.partitions || []).find(x => x.name === part);
    const want = String(role).startsWith('r') ? String(role) : 'r' + role;
    return p?.groups?.find(g => g.id === want)?.profile || null;
  };
  const twins = (exp.twins || []).map(tw => {
    const pa = profileOfRef(tw.a.part, tw.a.role), pb = profileOfRef(tw.b.part, tw.b.role);
    const shared = pa && pb ? Math.min(pa.shared, pb.shared) : null;
    const bits = pa && pb ? (tw.sim || 1) * templateGain(pa.req, sigFit) : null;
    return {
      a: `${tw.a.part}::${tw.a.role} ${tw.a.label || ''}`.trim(), b: `${tw.b.part}::${tw.b.role} ${tw.b.label || ''}`.trim(),
      sim: tw.sim, namedDifferently: !!tw.namedDifferently, sharedNodes: shared,
      gainBits: bits == null ? null : r2(bits),
      note: 'approximate: the export publishes the twin\'s coverage but not its shared core, so the gain is the smaller side\'s own core scaled by that coverage',
    };
  }).sort((a, b) => (b.gainBits || 0) - (a.gainBits || 0));

  // ---- cycles: a categorical graph fact, not a codelength excess. The minimal cut is the weakest edge on the
  // cycle by dependency count — a graph cut, and named as one.
  const medge = new Map();
  for (const e of exp.moduleGraph?.edges || []) medge.set(e.from + ' ' + e.to, e.n);
  const cycles = (exp.moduleGraph?.cycles || []).map(c => {
    let weakest = null;
    for (let i = 0; i < c.length; i++)
      for (let j = 0; j < c.length; j++) {
        if (i === j) continue;
        const n = medge.get(c[i] + ' ' + c[j]);
        if (n === undefined) continue;
        if (!weakest || n < weakest.n) weakest = { from: c[i], to: c[j], n };
      }
    return { modules: c, size: c.length, weakestEdge: weakest, note: 'a graph cut, not a compression gain' };
  });

  const ranked = {};
  for (const rank of ['file', 'scope', 'module'])
    ranked[rank] = [...elements.values()].filter(e => e.rank === rank)
      .sort((a, b) => b.totalExcessBits - a.totalExcessBits || (a.id < b.id ? -1 : 1));

  const fileUniverse = [...partFiles.values()].reduce((a, b) => a + b.length, 0);
  return {
    instrument: 'too-much/1',
    lambda: CFG.lambda, lambdaBits: r2(LAMBDA_BITS), minRaw: CFG.minRaw,
    repo: exp.repo || null, asOf: exp.asOf || null,
    universe: { files: fileUniverse, partitions: (cache?.partitions || []).length, modules: exp.moduleGraph?.nodes?.length || 0, historyCommits: fps ? fps.length : null },
    dimensions: dims,
    silentPopulations: silent,
    underpoweredPopulations: underpowered,
    ranked,
    duplication: duplication.slice(0, 40),
    twins: twins.slice(0, 20),
    cycles,
    disclosure: [
      '"Too much" is measured against THIS repository\'s own practice, one partition at a time. The modal bin printed for every dimension IS the yardstick: a repository where every file is a god-file has a god-file mode and flags nothing, correctly.',
      'One-sided by the meaning of the word: only a statistic ABOVE its population\'s modal bin can be excessive.',
      'The per-element total is the SUM of independent per-dimension codes and is used as a ranking key only. Size, fan-out and churn are correlated in real code, so the sum is an upper bound on a joint excess, never a claim of "N bits of debt".',
      `A population below CFG.minRaw=${CFG.minRaw} elements is silent and listed in silentPopulations — no default distribution is ever substituted. CFG.minRaw is not an extra floor: the largest excess attainable in a population of n is log2(2n-1), so reaching ${r2(LAMBDA_BITS)} bits needs n >= (λ+1)/2 = 4.5 — exactly 5.`,
      'A population that IS fitted but whose own concentration cannot reach the bound is listed in underpoweredPopulations. Its members are counted in `scored` and excluded from `scoredPowered`, so the fire rate can be read either way: over everything measured, or over everything that could have spoken.',
      'Churn and co-change breadth carry an age confound: a file present since the first commit has had more chances to be touched. Age is not corrected for; it is disclosed.',
      'The scope-size and responsibilities dimensions see only files grain has a grammar for; fan-in/fan-out see only files the relation layer resolves (export.relCoverage names the gap).',
      'Duplication, twins and cycles are reported as ranked gains, not as fired excesses: a template is repeated by definition, so no population makes one of them excessive.',
    ],
  };
}

const binRange = b => (b === 0 ? '0' : `${Math.pow(2, b) - 1}–${Math.pow(2, b + 1) - 2}`);

// ---------------------------------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------------------------------

export function renderMarkdown(res, top = 10) {
  const L = [];
  L.push(`# What does too much here — ${res.repo || ''} (as of ${res.asOf || 'n/a'})`);
  L.push('');
  L.push(`One bound, ${res.lambdaBits} bits (λ=${res.lambda}), the same one a deviation must clear. ` +
    `${res.universe.files} files in ${res.universe.partitions} partitions, ${res.universe.modules} modules` +
    (res.universe.historyCommits ? `, ${res.universe.historyCommits} commit footprints` : '') + '.');
  L.push('');
  L.push('## Fire rate per dimension');
  L.push('');
  L.push('| dimension | rank | scored | of those, in a population able to reach the bound | fired | fire rate (all / powered) | typical (modal bin, largest population) |');
  L.push('| --- | --- | --- | --- | --- | --- | --- |');
  for (const [id, d] of Object.entries(res.dimensions)) {
    const m = d.modes[0];
    L.push(`| ${id} | ${d.rank} | ${d.scored} | ${d.scoredPowered} | ${d.fired} | ${d.fireRate == null ? 'n/a' : d.fireRate + '%'} / ${d.fireRatePowered == null ? 'n/a' : d.fireRatePowered + '%'} | ${m ? `${m.modeRange} (n=${m.n})` : '—'} |`);
  }
  L.push('');
  for (const [id, d] of Object.entries(res.dimensions)) {
    if (!d.rows.length) continue;
    L.push(`## ${id} — top ${Math.min(top, d.rows.length)} of ${d.fired}`);
    L.push('');
    L.push('| # | element | stat | typical | excess (bits) | evidence | minimal cut |');
    L.push('| --- | --- | --- | --- | --- | --- | --- |');
    d.rows.slice(0, top).forEach((r, i) => {
      L.push(`| ${i + 1} | \`${r.id}\` | ${r.t} | ${r.modeRange} | ${r.excessBits} | ${evidenceLine(id, r)} | ${cutLine(r)} |`);
    });
    L.push('');
  }
  for (const rank of ['file', 'scope', 'module']) {
    const rows = res.ranked[rank] || [];
    if (!rows.length) continue;
    L.push(`## Ranked ${rank}s by total excess — top ${Math.min(top, rows.length)} of ${rows.length}`);
    L.push('');
    L.push('| # | element | total bits | dimensions |');
    L.push('| --- | --- | --- | --- |');
    rows.slice(0, top).forEach((e, i) => {
      const ds = Object.entries(e.dims).map(([k, v]) => `${k} ${v.t} (${v.excessBits}b)`).join(', ');
      L.push(`| ${i + 1} | \`${e.id}\` | ${e.totalExcessBits} | ${ds} |`);
    });
    L.push('');
  }
  if (res.duplication.length) {
    L.push(`## Duplication — top ${Math.min(top, res.duplication.length)} by extraction gain (a gain, not an excess)`);
    L.push('');
    L.push('| # | what | where | members | shared nodes | gain (bits) |');
    L.push('| --- | --- | --- | --- | --- | --- |');
    res.duplication.slice(0, top).forEach((t, i) =>
      L.push(`| ${i + 1} | ${t.what}${t.label ? ' ' + t.label : ''} | \`${t.where}\` | ${t.members} | ${t.sharedNodes} | ${t.gainBits} |`));
    L.push('');
  }
  if (res.cycles.length) {
    L.push('## Cycles — a graph fact, with a graph cut');
    L.push('');
    for (const c of res.cycles)
      L.push(`- ${c.modules.join(' → ')} — weakest edge ${c.weakestEdge ? `\`${c.weakestEdge.from}→${c.weakestEdge.to}\` (${c.weakestEdge.n})` : 'n/a'}`);
    L.push('');
  }
  if (res.silentPopulations.length) {
    L.push(`## Silent populations — ${res.silentPopulations.length} (disclosed, never defaulted)`);
    L.push('');
    const byDim = new Map();
    for (const s of res.silentPopulations) byDim.set(s.dimension, (byDim.get(s.dimension) || 0) + 1);
    for (const [d, n] of [...byDim].sort((a, b) => b[1] - a[1])) L.push(`- ${d}: ${n} population(s) below CFG.minRaw`);
    L.push('');
  }
  if (res.underpoweredPopulations.length) {
    L.push(`## Underpowered populations — ${res.underpoweredPopulations.length} (fitted, but the bound is out of reach)`);
    L.push('');
    const byDim = new Map();
    for (const s of res.underpoweredPopulations) byDim.set(s.dimension, (byDim.get(s.dimension) || 0) + 1);
    for (const [d, n] of [...byDim].sort((a, b) => b[1] - a[1])) L.push(`- ${d}: ${n} population(s) whose most extreme member could not clear ${res.lambdaBits} bits`);
    L.push('');
  }
  L.push('## Disclosure');
  L.push('');
  for (const d of res.disclosure) L.push(`- ${d}`);
  return L.join('\n');
}

function evidenceLine(id, r) {
  const e = r.evidence || {};
  if (id === 'responsibilities')
    return `${e.effGroups} effective of ${e.groups} groups over ${e.assignedScopes} scopes (H=${e.H}); ${e.ambiguousScopes} ambiguous; ${(e.byGroup || []).map(g => `${g.label || g.group}×${g.n}`).join(', ')}`;
  if (id === 'fanout' || id === 'fanin')
    return ((e.byDir || []).map(d => `${d.key}×${d.n}`).join(', ') || '—');
  if (id === 'mod-fanout') return (e.targets || []).map(([t, n]) => `${t}×${n}`).join(', ');
  if (id === 'mod-fanin') return (e.sources || []).map(([t, n]) => `${t}×${n}`).join(', ');
  if (id === 'churn' || id === 'cochange-breadth') return `${e.commits} commits, ${e.partners ?? '—'} partners`;
  if (id === 'scope-size') return `${e.kind} ${e.line}\u2013${e.endLine}`;
  if (id === 'size')
    return `${(e.byKind || []).map(k => `${k.kind}\u00d7${k.n}`).join(', ')}${e.widest ? `; widest \`${e.widest.name}\` ${e.widest.lines} lines` : ''}${e.spannedLines ? `; spans ${e.spannedLines} lines` : ''}`;
  if (id === 'multideviant')
    return `${r.t} of ${e.governedBy} conventions: ${(e.fired || []).map(f => `${f.observed}@${f.gapBits}b`).join(', ')}`;
  return '—';
}

const cutLine = r =>
  (r.cuts || []).map(c => `${c.kind}${c.target ? ` \`${c.target}\`` : ''}${c.parts ? ` → ${c.parts} parts` : ''}: ${c.gainBits} bits`).join('; ') || '—';

// ---------------------------------------------------------------------------------------------------

export async function run(opts) {
  const t0 = Date.now();
  const repo = resolve(opts.repo);
  const say = m => { if (!opts.quiet) console.error('[too-much] ' + m); };
  let exp;
  if (opts.exportPath) exp = JSON.parse(readFileSync(opts.exportPath, 'utf8'));
  else {
    say('running grain export ...');
    const out = join(repo, '.grain', 'too-much-export.json');
    const args = ['export', '--repo', repo, '--out', out];
    if (opts.noHistory) args.push('--no-history');
    execFileSync('node', [BIN, ...args], { encoding: 'utf8', maxBuffer: 1 << 29, timeout: 120 * 60_000, stdio: ['ignore', 'pipe', opts.quiet ? 'ignore' : 'inherit'] });
    exp = JSON.parse(readFileSync(out, 'utf8'));
  }
  const cache = loadCache(repo);
  if (!cache) throw new Error(`no model cache at ${join(repo, '.grain', 'cache', 'model.json')} — run \`grain export\` against this repo first`);
  const fps = opts.noHistory ? null : await loadFootprints(repo);
  const tree = loadTree(repo);
  say(`${(cache.partitions || []).length} partitions, ${(cache.filesAll || []).length} indexed files, ${fps ? fps.length : 0} commit footprints, ${tree ? tree.size + ' files with an uncapped scope inventory' : 'no tree cache (per-file scope counts saturate at the model cache\'s 200)'}`);
  const res = analyse({ exp, cache, fps, tree });
  res.wallSeconds = r2((Date.now() - t0) / 1000);
  return res;
}

function parseArgs(argv) {
  const o = { md: false, quiet: false, exportPath: null, noHistory: false, top: 10 };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--md') o.md = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--export') o.exportPath = argv[++i];
    else if (a === '--no-history') o.noHistory = true;
    else if (a === '--top') o.top = +argv[++i];
    else pos.push(a);
  }
  if (!pos[0] || !pos[1]) {
    console.error('usage: too-much.mjs <repo> <out.json> [--md] [--export <json>] [--top N] [--quiet] [--no-history]');
    process.exit(2);
  }
  o.repo = pos[0];
  o.out = pos[1];
  return o;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const o = parseArgs(process.argv.slice(2));
  run(o)
    .then(res => {
      writeFileSync(o.out, JSON.stringify(res, null, 1));
      const parts = Object.entries(res.dimensions).map(([id, d]) => `${id} ${d.fired}/${d.scored}`).join(' · ');
      console.log(`[too-much] ${res.repo}: ${parts} · ${res.wallSeconds}s`);
      if (o.md) console.log('\n' + renderMarkdown(res, o.top));
      process.exit(0);
    })
    .catch(e => {
      console.error('[too-much] ' + (e?.stack || e));
      process.exit(2);
    });
}
