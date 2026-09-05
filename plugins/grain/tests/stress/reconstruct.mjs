#!/usr/bin/env node
// Graph reconstruction (instrument G') — how much of a HAND-WRITTEN `.yggdrasil/` graph does grain's own
// `export` recover on its own?
//
// The north star (decisions.md `north-star-brownfield-miner`) is a maintainer adopting Yggdrasil on a brownfield
// repository: grain shortens the road from `git clone` to a working `.yggdrasil/`. The only honest way to know
// whether it does is to point grain at a repository that ALREADY has a hand-written graph and count what grain
// proposes by itself. That is what this script does. It never edits the pattern repo and never touches the
// engine — it drives `grain export` as a subprocess, reads the graph YAML, and counts.
//
//   node tests/stress/reconstruct.mjs <repo-with-.yggdrasil> <out.json> [--md]
//
// Options:
//   --md               also print the markdown tables on stdout
//   --export <path>    reuse an existing `grain export` JSON instead of spawning one (re-runs, tests)
//   --advise <path>    reuse captured `yg advise` text instead of spawning the Yggdrasil CLI
//   --yg <path>        Yggdrasil CLI entry (bin.js) to run `advise` with; without it, comparison (d) is
//                      reported as unmeasurable rather than guessed
//   --no-history       pass --no-history through to `grain export`
//   --quiet            no progress on stderr
//
// THE ORACLE IS FALLIBLE (decisions.md `oracle-is-fallible-report-disagreements-symmetrically`). A hand-written
// graph is a human artifact: it can be behind the code, coarser than the code, or simply a choice a different
// maintainer would not make. So every disagreement is reported in one of three classes and the headline
// precision/recall is computed on the RAW disagreement set but presented split by class:
//
//   (a) miner miss     — the evidence is there in the code and grain did not surface it. Grain's bug list.
//   (b) graph debt     — the hand graph diverges from what the code practices (a declared relation with no code
//                        backing anywhere; a `when` whose files do not co-locate; a mapping that splits a tight
//                        group). Informational: it is a finding ABOUT the pattern repo, not a grain defect, and
//                        this instrument never proposes changing it — Yggdrasil is read-only here.
//   (c) undecidable    — a granularity or judgement difference a human has to settle (grain drew the same
//                        boundary coarser or finer; a rule about an ABSENCE, which a miner of what-is-practiced
//                        cannot see by construction).
//
// Five comparisons:
//   (a) TYPES     — every classifying `node_types.<id>.when` expands to a file set; best Jaccard against any
//                   grain partition or module.
//   (b) NODES     — every `model/**/yg-node.yaml` `mapping:` expands to a file set; best Jaccard against any
//                   grain partition, module, role group or directory card.
//   (c) RELATIONS — declared node relations aggregated to (module→module) pairs vs grain's file edges aggregated
//                   the same way; plus `archNorms exp:"false"` against the architecture's own `default: deny`.
//   (d) CYCLES    — grain `moduleGraph.cycles` vs the loops `yg advise` nominates.
//   (e) ASPECTS   — for each deterministic aspect (a `check.mjs`), the literal identifiers it names, against the
//                   conventions and group markers grain reports on that aspect's own attach set.
//
// Where a comparison is not mechanically decidable the script reports `unmeasurable: N` and says why, rather
// than guessing. Read-only against both the engine and the pattern repository.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(here, '..', '..', 'bin', 'grain.mjs');
const REL_ENGINE = resolve(here, '..', '..', 'engine', 'relations.mjs');

// ==================================================================================================
// 1. Reading a Yggdrasil graph — the YAML subset, glob expansion, `when:`/`mapping:` expansion, `readGraph`.
//
// MOVED to `engine/yggdrasil-graph.mjs` (ticket 104), verbatim: `grain propose` is a product command now and
// must not import a test instrument. Re-exported here so every existing consumer of this module (propose.mjs,
// integration-stress.mjs, the tests) keeps the same names from the same place.
// ==================================================================================================
import {
  parseYaml, globToRe, pathMatcher, expandWhen, expandMapping, intersectSize, jaccard, readGraph, fileHead,
} from '../../engine/yggdrasil-graph.mjs';
export { parseYaml, globToRe, pathMatcher, expandWhen, expandMapping, intersectSize, jaccard, readGraph, fileHead };

// An `aspects:` list mixes bare ids and `{id, status}` maps.
const aspectIds = list => (list || []).map(a => (typeof a === 'string' ? a : a && a.id)).filter(Boolean);

// A node's file set INCLUDING its descendants. An organizational node (`module`, `project`) carries no mapping
// of its own — it owns whatever its children map — and both relation targets and `yg advise`'s "module group"
// nominations name such nodes, so a comparison that used the bare `mapping:` would score them as empty.
export function subtreeFileSets(graph, files, ctx) {
  const own = new Map();
  for (const n of graph.nodes) own.set(n.id, expandMapping(n.mapping, files, ctx));
  const out = new Map();
  for (const n of graph.nodes) {
    const s = new Set(own.get(n.id));
    const prefix = n.id + '/';
    for (const m of graph.nodes) if (m.id.startsWith(prefix)) for (const f of own.get(m.id)) s.add(f);
    out.set(n.id, s);
  }
  return out;
}

// ==================================================================================================
// 4. Reading grain's side.
// ==================================================================================================

function gitFiles(repo) {
  return execFileSync('git', ['-C', repo, 'ls-files'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean);
}

// grain's module assignment is a pure function of (files, package roots) — `refineModOf` in engine/relations.mjs.
// The instrument IMPORTS it rather than re-deriving it, so a module id here is byte-identical to the one grain's
// own moduleGraph used. Falls back to longest-prefix over the exported node ids if that import ever fails; the
// run's self-check (`moduleAssignmentMismatch`) reports the cost either way.
export async function moduleAssigner(exp, cache) {
  try {
    const { refineModOf } = await import(pathToFileURL(REL_ENGINE).href);
    if (cache && Array.isArray(cache.filesAll)) return refineModOf(cache.filesAll, cache.pkgs || []);
  } catch { /* fall through to the id-prefix approximation */ }
  const ids = (exp.moduleGraph?.nodes || []).map(n => n.id).sort((a, b) => b.length - a.length);
  return rel => ids.find(id => (id === '.' ? !rel.includes('/') : (rel + '/').startsWith(id + '/'))) || '.';
}

function loadCache(repo) {
  try { return JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8')); } catch { return null; }
}

// Every file-set grain proposes on its own, labelled by where in the export it came from.
export function grainCandidates(exp, cache, modOf, files) {
  const cands = [];
  const byModule = new Map();
  for (const rel of files) {
    const m = modOf(rel);
    let s = byModule.get(m);
    if (!s) { s = new Set(); byModule.set(m, s); }
    s.add(rel);
  }
  for (const [id, s] of byModule) cands.push({ kind: 'module', name: id, files: s });
  for (const p of cache?.partitions || []) {
    if (Array.isArray(p.files)) cands.push({ kind: 'partition', name: p.name, files: new Set(p.files) });
  }
  const fileSet = new Set(files);
  for (const p of exp.partitions || []) {
    for (const g of p.groups || []) {
      const s = new Set((g.members || []).map(m => m.rel).filter(r => r && fileSet.has(r)));
      if (s.size) cands.push({ kind: 'group', name: `${p.name}::${g.id} ${g.label || ''}`.trim(), files: s });
    }
    for (const d of p.directories || []) {
      if (!d.dir) continue;
      const s = new Set(files.filter(rel => rel.startsWith(d.dir + '/') || rel === d.dir));
      if (s.size) cands.push({ kind: 'directory', name: d.dir, files: s });
    }
  }
  return cands;
}

export function bestMatch(target, cands, kinds) {
  let best = { j: 0, kind: null, name: null, inter: 0, candSize: 0 };
  for (const c of cands) {
    if (kinds && !kinds.includes(c.kind)) continue;
    const j = jaccard(target, c.files);
    if (j > best.j) best = { j: +j.toFixed(4), kind: c.kind, name: c.name, inter: intersectSize(target, c.files), candSize: c.files.size };
  }
  return best;
}

// ---- the three-class verdict for a set-vs-set disagreement (types, nodes) ----
// A hand-drawn set that grain's partitions/modules do not reproduce is one of:
//   (a) miner miss    — grain HAS the set, just not at the level being scored (a role group or directory card
//                       matches it), or the set is a whole directory grain never named at all;
//   (c) undecidable   — grain drew the same locality COARSER (the set is a slice of one grain cluster) or FINER
//                       (the set is a union of clusters that are each almost entirely inside it);
//   (b) graph debt    — the set is not a locality in the code's own layout at all: its files spread over several
//                       grain modules, none of which is mostly this set. The hand graph groups files the code
//                       does not group.
export function classifyMiss(target, modOf, cands, bestScored) {
  const bestAny = bestMatch(target, cands);
  // class (a) only when a level the scored comparison does NOT look at reproduces the set — grain HAS it and the
  // surface being measured simply does not carry it. If the best candidate overall is the one already scored,
  // this is not "grain cannot see it", it is a granularity question, and it falls through below.
  if (bestAny.j >= 0.5 && bestAny.j > (bestScored?.j ?? 0)) {
    return { class: 'a', label: 'miner miss', why: `grain has this set as ${bestAny.kind} "${bestAny.name}" (J=${bestAny.j}) but not at the level being scored`, bestAny };
  }
  const per = new Map();
  for (const f of target) { const m = modOf(f); per.set(m, (per.get(m) || 0) + 1); }
  const modSizes = new Map();
  for (const c of cands) if (c.kind === 'module') modSizes.set(c.name, c.files.size);
  const ranked = [...per].sort((a, b) => b[1] - a[1]);
  const [top, topN] = ranked[0];
  const topShare = topN / target.size;
  const topPurity = topN / (modSizes.get(top) || topN);
  if (topShare >= 0.9 && topPurity < 0.5) {
    return { class: 'c', label: 'undecidable (grain coarser)', why: `${(topShare * 100).toFixed(0)}% of the set sits in module "${top}", which is ${(topPurity * 100).toFixed(0)}% this set — grain drew the same locality one level coarser`, bestAny };
  }
  const pure = ranked.filter(([m, n]) => n / (modSizes.get(m) || n) >= 0.9);
  const pureCover = pure.reduce((a, [, n]) => a + n, 0) / target.size;
  if (pure.length >= 2 && pureCover >= 0.9) {
    return { class: 'c', label: 'undecidable (grain finer)', why: `the set is the union of ${pure.length} grain modules (${pure.slice(0, 4).map(([m]) => m).join(', ')}), each of which is almost entirely inside it`, bestAny };
  }
  return { class: 'b', label: 'graph debt (informational)', why: `the set spreads over ${per.size} grain modules and none of them is mostly this set (largest: "${top}", ${(topShare * 100).toFixed(0)}% of the set / ${(topPurity * 100).toFixed(0)}% of the module) — it is not a locality in the code's own layout`, bestAny };
}

// ==================================================================================================
// 5. The five comparisons.
// ==================================================================================================

const TESTISH = /(^|\/)(tests?|__tests__|spec|fixtures?|drills)(\/|$)|\.(test|spec)\.[A-Za-z]+$/;
const stratumOf = set => {
  let t = 0;
  for (const f of set) if (TESTISH.test(f)) t++;
  return set.size && t / set.size > 0.5 ? 'test' : 'source';
};
const classTally = rows => {
  const t = { a: 0, b: 0, c: 0 };
  for (const r of rows) if (r.verdict) t[r.verdict.class]++;
  return t;
};
// grain only ever READ the files it has a grammar for; a hand-drawn set made of files grain never parsed cannot
// be recovered from conventions or groups at all, and counting it in the headline would hide the reason.
const parsedShareOf = (set, parsed) => {
  if (!parsed || !parsed.size) return null;
  let n = 0;
  for (const f of set) if (parsed.has(f)) n++;
  return +(n / set.size).toFixed(3);
};
const summarise = (sub, key) => ({
  [key]: sub.length,
  ge50: sub.filter(r => r.best.j >= 0.5).length,
  ge80: sub.filter(r => r.best.j >= 0.8).length,
  meanJ: sub.length ? +(sub.reduce((a, r) => a + r.best.j, 0) / sub.length).toFixed(3) : null,
  classes: classTally(sub),
});

export function compareTypes(graph, files, ctx, cands, modOf) {
  const types = graph.arch.node_types || {};
  const rows = [];
  let organizational = 0, empty = 0;
  for (const [id, t] of Object.entries(types)) {
    if (!t || !t.when) { organizational++; continue; }
    const set = expandWhen(t.when, files, ctx);
    if (!set.size) { empty++; rows.push({ type: id, files: 0, best: null, note: 'the when matches no tracked file' }); continue; }
    const best = bestMatch(set, cands, ['partition', 'module']);
    const row = { type: id, files: set.size, stratum: stratumOf(set), parsedShare: parsedShareOf(set, ctx.parsed), best };
    if (best.j < 0.5) row.verdict = classifyMiss(set, modOf, cands, best);
    rows.push(row);
  }
  const scored = rows.filter(r => r.best);
  const at = th => scored.filter(r => r.best.j >= th).length;
  return {
    classifyingTypes: scored.length, organizationalTypes: organizational, unmeasurable: empty,
    ge50: at(0.5), ge80: at(0.8),
    recallAt50: scored.length ? +(at(0.5) / scored.length).toFixed(3) : null,
    recallAt80: scored.length ? +(at(0.8) / scored.length).toFixed(3) : null,
    meanJaccard: scored.length ? +(scored.reduce((a, r) => a + r.best.j, 0) / scored.length).toFixed(3) : null,
    disagreementClasses: classTally(scored),
    byStratum: {
      source: summarise(scored.filter(r => r.stratum === 'source'), 'types'),
      test: summarise(scored.filter(r => r.stratum === 'test'), 'types'),
      grainParsed: summarise(scored.filter(r => (r.parsedShare ?? 1) >= 0.5), 'types'),
      grainNeverParsed: summarise(scored.filter(r => (r.parsedShare ?? 1) < 0.5), 'types'),
    },
    rows: rows.sort((a, b) => (a.best?.j ?? -1) - (b.best?.j ?? -1)),
  };
}

export function compareNodes(graph, files, ctx, cands, modOf) {
  const rows = [];
  let noMapping = 0, empty = 0;
  for (const n of graph.nodes) {
    if (!Array.isArray(n.mapping) || !n.mapping.length) { noMapping++; continue; }
    const set = expandMapping(n.mapping, files, ctx);
    if (!set.size) { empty++; rows.push({ node: n.id, type: n.type, files: 0, best: null, note: 'the mapping matches no tracked file' }); continue; }
    const best = bestMatch(set, cands);
    const row = { node: n.id, type: n.type, files: set.size, stratum: stratumOf(set), parsedShare: parsedShareOf(set, ctx.parsed), best };
    if (best.j < 0.5) row.verdict = classifyMiss(set, modOf, cands, best);
    rows.push(row);
  }
  const scored = rows.filter(r => r.best);
  const at = th => scored.filter(r => r.best.j >= th).length;
  const byKind = {};
  for (const r of scored) { const k = r.best.kind || 'none'; byKind[k] = (byKind[k] || 0) + 1; }
  return {
    nodesWithMapping: scored.length, nodesWithoutMapping: noMapping, unmeasurable: empty,
    ge50: at(0.5), ge80: at(0.8),
    recallAt50: scored.length ? +(at(0.5) / scored.length).toFixed(3) : null,
    recallAt80: scored.length ? +(at(0.8) / scored.length).toFixed(3) : null,
    meanJaccard: scored.length ? +(scored.reduce((a, r) => a + r.best.j, 0) / scored.length).toFixed(3) : null,
    disagreementClasses: classTally(scored),
    // a node that maps ONE file can never reach a high Jaccard against a directory or a role group, so the
    // headline is dominated by the hand graph's own granularity — the stratified rows are the honest read
    byStratum: {
      singleFile: summarise(scored.filter(r => r.files === 1), 'nodes'),
      twoToFour: summarise(scored.filter(r => r.files >= 2 && r.files <= 4), 'nodes'),
      fivePlus: summarise(scored.filter(r => r.files >= 5), 'nodes'),
      grainParsed: summarise(scored.filter(r => (r.parsedShare ?? 1) >= 0.5), 'nodes'),
      grainNeverParsed: summarise(scored.filter(r => (r.parsedShare ?? 1) < 0.5), 'nodes'),
    },
    bestKindHistogram: byKind,
    rows: rows.sort((a, b) => (a.best?.j ?? -1) - (b.best?.j ?? -1)),
  };
}

// A cheap mention index: which files name a given path stem anywhere in their first 256 KB. Used only to tell a
// declared relation with SOME textual backing (grain's resolver missed it — class a) from one with none at all
// (declared but never practiced — class b).
function mentionIndex(files, ctx) {
  const stems = new Map();                        // stem -> [rel, ...] (the files that stem names)
  for (const rel of files) {
    const stem = basename(rel, extname(rel));
    if (stem.length < 4) continue;
    (stems.get(stem) || stems.set(stem, []).get(stem)).push(rel);
  }
  const mentions = new Map();                     // stem -> Set(files that mention it)
  for (const rel of files) {
    const text = fileHead(ctx.root, rel, ctx.headCache);
    if (!text || /\x00/.test(text.slice(0, 2000))) continue;
    const seen = new Set();
    for (const m of text.matchAll(/[A-Za-z_][A-Za-z0-9_.-]{3,}/g)) {
      const w = m[0];
      if (seen.has(w)) continue;
      seen.add(w);
      if (!stems.has(w)) continue;
      (mentions.get(w) || mentions.set(w, new Set()).get(w)).add(rel);
    }
  }
  return { stems, mentions };
}

export function compareRelations(graph, files, ctx, exp, modOf) {
  const nodeFiles = subtreeFileSets(graph, files, ctx);
  const modsOf = id => { const s = new Set(); for (const f of nodeFiles.get(id) || []) s.add(modOf(f)); return s; };

  const declaredPairs = new Map();                // "a\x00b" -> {from,to,via:[node→node]}
  let declaredRelations = 0, unresolvedTargets = 0, selfModule = 0;
  for (const n of graph.nodes) {
    for (const r of Array.isArray(n.relations) ? n.relations : []) {
      if (!r || !r.target) continue;
      declaredRelations++;
      const A = modsOf(n.id), B = modsOf(r.target);
      if (!nodeFiles.has(r.target) || !A.size || !B.size) { unresolvedTargets++; continue; }
      for (const a of A) for (const b of B) {
        if (a === b) { selfModule++; continue; }
        const k = a + '\x00' + b;
        let e = declaredPairs.get(k);
        if (!e) { e = { from: a, to: b, via: [] }; declaredPairs.set(k, e); }
        if (e.via.length < 6) e.via.push(`${n.id} -> ${r.target}`);
      }
    }
  }

  const grainPairs = new Map();
  for (const e of exp.edges || []) {
    const a = modOf(e.from), b = modOf(e.to);
    if (a === b) continue;
    const k = a + '\x00' + b;
    grainPairs.set(k, (grainPairs.get(k) || 0) + (e.n || 1));
  }
  const srcSeen = new Set();
  for (const e of exp.edges || []) srcSeen.add(modOf(e.from));

  const { stems, mentions } = mentionIndex(files, ctx);
  const modFiles = new Map();
  for (const rel of files) {
    const m = modOf(rel);
    (modFiles.get(m) || modFiles.set(m, new Set()).get(m)).add(rel);
  }
  // does ANY file of module `from` name (by path stem) ANY file of module `to`?
  const textualBacking = (from, to) => {
    const src = modFiles.get(from) || new Set();
    for (const rel of modFiles.get(to) || []) {
      const stem = basename(rel, extname(rel));
      const who = mentions.get(stem);
      if (!who) continue;
      for (const f of who) if (src.has(f)) return stem;
    }
    return null;
  };

  const matched = [], missA = [], missB = [], missC = [];
  for (const [k, v] of declaredPairs) {
    if (grainPairs.has(k)) { matched.push(v); continue; }
    if (!srcSeen.has(v.from)) { missC.push({ ...v, class: 'c', why: `grain resolved no outgoing edge at all from module "${v.from}" — nothing to compare (relation coverage gap)` }); continue; }
    const stem = textualBacking(v.from, v.to);
    if (stem) missA.push({ ...v, class: 'a', why: `a file in "${v.from}" names "${stem}" from "${v.to}", so the dependency is visible in the text and grain's resolver did not turn it into an edge` });
    else missB.push({ ...v, class: 'b', why: `no file in "${v.from}" names any file of "${v.to}" — the relation is declared but has no code backing at HEAD` });
  }

  // pairs only grain has: allowed by the architecture but undeclared (declaration debt) vs everything else
  const types = graph.arch.node_types || {};
  const allowedTypePairs = new Set();
  for (const [tid, t] of Object.entries(types)) {
    const rel = t && t.relations;
    if (!rel || typeof rel !== 'object') continue;
    for (const [kind, list] of Object.entries(rel)) {
      if (kind === 'default') continue;
      for (const target of Array.isArray(list) ? list : []) allowedTypePairs.add(tid + '\x00' + target);
    }
  }
  const typeOfFile = new Map();
  for (const [tid, t] of Object.entries(types)) {
    if (!t || !t.when) continue;
    for (const f of expandWhen(t.when, files, ctx)) if (!typeOfFile.has(f)) typeOfFile.set(f, tid);
  }
  const dominantType = new Map();
  const perMod = new Map();
  for (const f of files) {
    const t = typeOfFile.get(f);
    if (!t) continue;
    const m = modOf(f);
    const c = perMod.get(m) || new Map();
    c.set(t, (c.get(t) || 0) + 1);
    perMod.set(m, c);
  }
  for (const [m, c] of perMod) {
    const tot = [...c.values()].reduce((a, b) => a + b, 0);
    const [t, n] = [...c].sort((a, b) => b[1] - a[1])[0];
    dominantType.set(m, n / tot >= 0.6 ? t : null);
  }

  const extraB = [], extraC = [];
  for (const [k, n] of grainPairs) {
    if (declaredPairs.has(k)) continue;
    const [from, to] = k.split('\x00');
    const ta = dominantType.get(from), tb = dominantType.get(to);
    if (ta && tb && allowedTypePairs.has(ta + '\x00' + tb)) extraB.push({ from, to, n, class: 'b', why: `the architecture allows ${ta} -> ${tb} but no node declares this pair — a declaration the hand graph does not carry` });
    else extraC.push({ from, to, n, class: 'c', why: ta && tb ? `the architecture denies ${ta} -> ${tb}: either a real boundary crossing, a grain false edge, or module-vs-node granularity` : 'no dominant node type on one side — undecidable without a human' });
  }

  const measurable = matched.length + missA.length + missB.length;
  const out = {
    declaredRelations, relationsWithNoFileExpansion: unresolvedTargets, declaredRelationsInsideOneModule: selfModule,
    declaredPairs: declaredPairs.size, grainPairs: grainPairs.size, matched: matched.length,
    recallAll: declaredPairs.size ? +(matched.length / declaredPairs.size).toFixed(3) : null,
    recallMeasurable: measurable ? +(matched.length / measurable).toFixed(3) : null,
    precision: grainPairs.size ? +(matched.length / grainPairs.size).toFixed(3) : null,
    missClassA: missA.length, missClassB: missB.length, missClassC: missC.length,
    extraClassB: extraB.length, extraClassC: extraC.length,
    topMissA: missA.slice(0, 20), topMissB: missB.slice(0, 20), topMissC: missC.slice(0, 10),
    topExtraB: extraB.sort((a, b) => b.n - a.n).slice(0, 15), topExtraC: extraC.sort((a, b) => b.n - a.n).slice(0, 15),
  };

  const norms = (exp.archNorms || []).filter(n => String(n.exp) === 'false');
  const normRows = [];
  let agree = 0, disagree = 0, unmeasurableNorms = 0;
  for (const n of norms) {
    const ta = dominantType.get(n.from), tb = dominantType.get(n.to);
    if (!ta || !tb) { unmeasurableNorms++; normRows.push({ from: n.from, to: n.to, verdict: 'unmeasurable', why: 'no dominant node type on one side (<60% of its files carry one type)' }); continue; }
    if (allowedTypePairs.has(ta + '\x00' + tb)) { disagree++; normRows.push({ from: n.from, to: n.to, verdict: 'contradicts', why: `the architecture ALLOWS ${ta} -> ${tb}, grain says the module pair is established as never happening` }); }
    else { agree++; normRows.push({ from: n.from, to: n.to, verdict: 'agrees', why: `the architecture denies ${ta} -> ${tb} (default: deny)` }); }
  }
  out.archNorms = { falseNorms: norms.length, agreesWithDeny: agree, contradictsAllowList: disagree, unmeasurable: unmeasurableNorms, rows: normRows };
  out.nodeLevel = compareRelationsAtNodeLevel(graph, files, ctx, exp);
  return out;
}

// The module aggregation the ticket asks for collapses 1200+ declared relations into a few dozen pairs, so it
// measures the module graph rather than the relation graph. This is the same comparison at the granularity the
// hand graph actually uses: a file is owned by the node whose `mapping:` names it most specifically, and both
// sides are aggregated to (owning node -> owning node).
export function compareRelationsAtNodeLevel(graph, files, ctx, exp) {
  const own = new Map();
  for (const n of graph.nodes) own.set(n.id, expandMapping(n.mapping, files, ctx));
  const ownerOf = new Map();                      // file -> the node with the SMALLEST mapping that claims it
  for (const [id, set] of own) {
    for (const f of set) {
      const cur = ownerOf.get(f);
      if (!cur || set.size < own.get(cur).size) ownerOf.set(f, id);
    }
  }
  const declared = new Map();
  let unowned = 0;
  for (const n of graph.nodes) {
    for (const r of Array.isArray(n.relations) ? n.relations : []) {
      if (!r || !r.target) continue;
      if (!own.get(n.id)?.size || !own.get(r.target)?.size) { unowned++; continue; }
      declared.set(n.id + ' ' + r.target, { from: n.id, to: r.target, type: r.type || null });
    }
  }
  const grain = new Map();
  for (const e of exp.edges || []) {
    const a = ownerOf.get(e.from), b = ownerOf.get(e.to);
    if (!a || !b || a === b) continue;
    const k = a + ' ' + b;
    grain.set(k, (grain.get(k) || 0) + (e.n || 1));
  }
  let matched = 0;
  const missed = [], extra = [];
  for (const [k, v] of declared) { if (grain.has(k)) matched++; else missed.push(v); }
  for (const [k, n] of grain) if (!declared.has(k)) { const [from, to] = k.split(' '); extra.push({ from, to, n }); }
  return {
    filesWithAnOwningNode: ownerOf.size, filesTracked: files.length,
    declaredPairs: declared.size, grainPairs: grain.size, matched,
    declaredRelationsWithAnUnmappedEnd: unowned,
    recall: declared.size ? +(matched / declared.size).toFixed(3) : null,
    precision: grain.size ? +(matched / grain.size).toFixed(3) : null,
    topMissed: missed.slice(0, 20), topExtra: extra.sort((a, b) => b.n - a.n).slice(0, 20),
  };
}

// `yg advise` nominates a loop with the phrase "depend on each other in a loop"; pull the node ids out of the
// item that carries it.
export function parseAdviseCycles(text) {
  const out = [];
  const lines = (text || '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (!/depend on each other in a loop/i.test(lines[i])) continue;
    // the headline quotes each member: "Module groups 'a/b', 'c/d', 'e' depend on each other in a loop."
    let ids = [...lines[i].matchAll(/'([^']+)'/g)].map(m => m[1]);
    if (ids.length < 2) {
      const window = lines.slice(Math.max(0, i - 3), i + 6).join(' ');
      ids = [...window.matchAll(/(?:^|[\s`'"(,])([A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)+)/g)].map(m => m[1])
        .filter(x => !/\.(ts|js|mjs|md|json|yaml|yml)$/.test(x));
    }
    const uniq = [...new Set(ids)];
    if (uniq.length >= 2) out.push(uniq);
  }
  return out;
}

export function compareCycles(exp, adviseText, graph, files, ctx, modOf) {
  const grainCycles = (exp.moduleGraph?.cycles || []).map(c => (Array.isArray(c) ? c : c.nodes || []));
  if (adviseText == null) {
    return { grainCycles: grainCycles.length, grainCycleMembers: grainCycles, adviseCycles: null, unmeasurable: grainCycles.length, why: 'yg advise output not supplied (--yg / --advise)' };
  }
  const advise = parseAdviseCycles(adviseText);
  const subtree = subtreeFileSets(graph, files, ctx);
  const nodeMods = new Map();
  for (const n of graph.nodes) {
    const s = new Set();
    for (const f of subtree.get(n.id) || []) s.add(modOf(f));
    nodeMods.set(n.id, s);
  }
  const grainSets = grainCycles.map(c => new Set(c));
  const rows = [];
  let matched = 0;
  const usedGrain = new Set();
  for (const ids of advise) {
    const pm = new Set();
    for (const id of ids) for (const m of nodeMods.get(id) || []) pm.add(m);
    let best = { j: 0, idx: -1 };
    grainSets.forEach((g, idx) => { const j = jaccard(pm, g); if (j > best.j) best = { j: +j.toFixed(3), idx }; });
    if (best.j >= 0.5) { matched++; usedGrain.add(best.idx); }
    rows.push({ adviseNodes: ids, adviseModules: [...pm], bestGrainCycle: best.idx >= 0 ? grainCycles[best.idx] : null, jaccard: best.j, verdict: best.j >= 0.5 ? 'matched' : (pm.size ? 'a' : 'c') });
  }
  return {
    grainCycles: grainCycles.length, grainCycleMembers: grainCycles,
    adviseCycles: advise.length, matchedAtJ50: matched,
    adviseOnly: advise.length - matched, grainOnly: grainCycles.length - usedGrain.size,
    recall: advise.length ? +(matched / advise.length).toFixed(3) : null,
    unmeasurable: 0, rows,
  };
}

// ---- (e) aspects ----
// The REPO vocabulary a deterministic rule script names — the identifiers and module specifiers it forbids or
// requires. A `check.mjs` is full of tree-sitter grammar vocabulary too (`'function'`, `'import'`, `'body'`,
// `'string'`), which is the AST library's alphabet, not this repository's, and counting it would fabricate
// matches. So a literal is taken only when it is unmistakably a name from the code under review:
//   - a member of a `new Set([...])` or of a SHOUTY_CONST array (the house shape for a forbidden/required list),
//   - a module specifier (`node:fs`, `@scope/pkg`, `../x/y`) — anything with `/` or `:` in it,
//   - a dotted API path (`Date.now`, `process.env`),
//   - a camelCase or PascalCase identifier (`buildIssueMessage`, `PortalData`).
// A bare lowercase word is dropped: it cannot be told apart from a grammar node type.
export function aspectLiterals(src) {
  const text = String(src).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  // what the rule script imports FOR ITSELF is the aspect harness's vocabulary, not the reviewed repo's
  const ownImports = new Set();
  for (const m of text.matchAll(/(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*\(\s*)(['"])((?:\\.|(?!\1)[^\\])*)\1/g)) ownImports.add(m[2]);
  const listed = new Set();
  const collect = body => {
    for (const m of body.matchAll(/(['"])((?:\\.|(?!\1)[^\\])*)\1/g)) listed.add(m[2]);
  };
  for (const m of text.matchAll(/new\s+Set\s*\(\s*\[([^\]]*)\]/g)) collect(m[1]);
  for (const m of text.matchAll(/\b[A-Z][A-Z0-9_]{2,}\s*=\s*\[([^\]]*)\]/g)) collect(m[1]);
  const out = new Set();
  const keep = s => {
    if (s.length < 3 || s.length > 80) return false;
    if (/\s/.test(s)) return false;
    if (!/^[@A-Za-z_$.][\w$./:@-]*$/.test(s)) return false;
    if (/^(utf8|true|false|null|undefined)$/i.test(s)) return false;
    if (ownImports.has(s)) return false;          // the check's own dependency, not a name it polices
    if (/^\.{1,2}(\/\.{2})*\/?$/.test(s)) return false;   // a bare `../` path fragment is not a name
    return true;
  };
  for (const s of listed) if (keep(s)) out.add(s);
  for (const m of text.matchAll(/(['"])((?:\\.|(?!\1)[^\\])*)\1/g)) {
    const s = m[2];
    if (!keep(s)) continue;
    if (/[/:]/.test(s) || /^[A-Za-z_$][\w$]*\.[A-Za-z_$][\w$.]*$/.test(s) || /^[a-z][a-z0-9]*[A-Z]/.test(s) || /^[A-Z][a-z]/.test(s)) out.add(s);
  }
  return out;
}

// An aggregate aspect (`reviewer: {type: aggregate}`, e.g. `source-hygiene`) lists its children under `implies:`
// and expands to them wherever it is attached; a child of an aggregate is never attached by name anywhere, so
// without this every one of them would score as "attaches to no tracked file".
function expandAggregates(graph) {
  const kids = new Map();
  for (const a of graph.aspects) {
    const list = [...aspectIds(a.implies), ...aspectIds(a.aspects)];
    if (list.length) kids.set(a.id, list);
  }
  const closure = id => {
    const seen = new Set([id]);
    const stack = [id];
    while (stack.length) {
      const cur = stack.pop();
      for (const k of kids.get(cur) || []) if (!seen.has(k)) { seen.add(k); stack.push(k); }
    }
    return seen;
  };
  return closure;
}
const tokensOf = s => String(s).split(/[^A-Za-z0-9]+/)
  .flatMap(p => p.replace(/([a-z0-9])([A-Z])/g, '$1 $2').split(/\s+/))
  .filter(Boolean).map(t => t.toLowerCase());
const keyOfName = s => tokensOf(s).join('');

export function compareAspects(graph, files, ctx, exp) {
  const types = graph.arch.node_types || {};
  const attach = new Map();
  const add = (aid, set) => {
    let s = attach.get(aid);
    if (!s) { s = new Set(); attach.set(aid, s); }
    for (const f of set) s.add(f);
  };
  const closure = expandAggregates(graph);
  for (const [, t] of Object.entries(types)) {
    if (!t) continue;
    const set = t.when ? expandWhen(t.when, files, ctx) : new Set();
    for (const a of aspectIds(t.aspects)) for (const eff of closure(a)) add(eff, set);
  }
  // "Aspects cascade to all child nodes" (yg schemas read node), so an organizational node's aspects attach to
  // its whole subtree — using the bare `mapping:` would leave every such aspect with an empty attach set.
  const subtree = subtreeFileSets(graph, files, ctx);
  for (const n of graph.nodes) {
    const set = subtree.get(n.id) || new Set();
    for (const a of aspectIds(n.aspects)) for (const eff of closure(a)) add(eff, set);
  }

  // grain's vocabulary per file: convention statements/features/observed values, plus group labels and markers
  const vocabPerFile = new Map();
  const push = (rel, word) => {
    if (!rel || !word) return;
    let s = vocabPerFile.get(rel);
    if (!s) { s = new Set(); vocabPerFile.set(rel, s); }
    s.add(keyOfName(word));
  };
  const conventionWords = c => {
    const w = [];
    for (const k of ['expected', 'context', 'unit', 'kind']) if (typeof c[k] === 'string') w.push(c[k]);
    if (c.feature) {
      if (typeof c.feature === 'string') w.push(c.feature);
      else { if (c.feature.enumerator) w.push(String(c.feature.enumerator)); if (c.feature.argument) w.push(String(c.feature.argument)); }
    }
    if (c.context && typeof c.context === 'object' && c.context.label) w.push(String(c.context.label));
    for (const a of Array.isArray(c.alphabet) ? c.alphabet : []) if (typeof a === 'string') w.push(a);
    if (typeof c.statement === 'string') for (const m of c.statement.matchAll(/`([^`]+)`/g)) w.push(m[1]);
    return w;
  };
  for (const c of exp.conventions || []) {
    const words = conventionWords(c);
    for (const s of [...(c.conformingSites || []), ...(c.deviatingSites || []), ...(c.exemplars || [])]) {
      const rel = s.rel || s.file;
      for (const w of words) push(rel, w);
      if (typeof s.observed === 'string') push(rel, s.observed);
      if (typeof s.name === 'string') push(rel, s.name);
    }
  }
  for (const p of exp.partitions || []) {
    for (const g of p.groups || []) {
      const words = [g.label, ...(g.nameTokens || []), ...(g.imports || []),
        ...(g.markers || []).map(m => (typeof m === 'string' ? m : m.marker || m.name))].filter(Boolean);
      for (const m of g.members || []) for (const w of words) push(m.rel, w);
    }
    for (const mk of p.markers || []) {
      const w = typeof mk === 'string' ? mk : mk.name || mk.marker;
      if (!w) continue;
      for (const car of mk.carriers || []) push(car.rel, w);
    }
  }

  const rows = [];
  let matched = 0, missA = 0, missC = 0, unmeasurable = 0;
  for (const a of graph.aspects) {
    if (!a.hasCheck) continue;                     // (e) is the deterministic half only
    let src = '';
    try { src = readFileSync(join(a.dir, 'check.mjs'), 'utf8'); } catch { /* unreadable */ }
    const lits = aspectLiterals(src);
    const set = attach.get(a.id) || new Set();
    if (!lits.size) { unmeasurable++; rows.push({ aspect: a.id, literals: 0, attachFiles: set.size, verdict: 'unmeasurable', why: 'the check names no literal identifier — a purely structural rule, with no name for grain to match' }); continue; }
    if (!set.size) { unmeasurable++; rows.push({ aspect: a.id, literals: lits.size, attachFiles: 0, verdict: 'unmeasurable', why: 'the aspect attaches to no tracked file (its type or node expands to nothing)' }); continue; }
    const vocab = new Set();
    for (const f of set) for (const k of vocabPerFile.get(f) || []) vocab.add(k);
    const hits = [...lits].filter(l => vocab.has(keyOfName(l)));
    if (hits.length) { matched++; rows.push({ aspect: a.id, literals: lits.size, attachFiles: set.size, verdict: 'matched', hits: hits.slice(0, 8) }); continue; }
    // no grain word matches. Do the aspect's own literals even OCCUR in the attach set's text? If not, the rule
    // forbids something absent — a miner of what IS practiced cannot see it, by construction.
    let present = null;
    for (const f of set) {
      const text = fileHead(ctx.root, f, ctx.headCache);
      if (!text) continue;
      const hit = [...lits].find(l => text.includes(l));
      if (hit) { present = { literal: hit, file: f }; break; }
    }
    if (present) { missA++; rows.push({ aspect: a.id, literals: lits.size, attachFiles: set.size, verdict: 'a', why: `"${present.literal}" occurs in ${present.file} yet no grain convention or group marker on this attach set names it`, sample: [...lits].slice(0, 8) }); }
    else { missC++; rows.push({ aspect: a.id, literals: lits.size, attachFiles: set.size, verdict: 'c', why: 'none of the names the rule mentions occurs anywhere in the attach set — the rule forbids an ABSENCE, which a miner of what is practiced cannot see by construction', sample: [...lits].slice(0, 8) }); }
  }
  return {
    deterministicAspects: rows.length, matched, minerMiss: missA, invisibleByConstruction: missC, unmeasurable,
    proseAspects: graph.aspects.filter(a => !a.hasCheck).length,
    matchRate: matched + missA + missC ? +(matched / (matched + missA + missC)).toFixed(3) : null,
    matchRateMeasurable: matched + missA ? +(matched / (matched + missA)).toFixed(3) : null,
    rows: rows.sort((x, y) => (x.verdict < y.verdict ? -1 : x.verdict > y.verdict ? 1 : 0)),
  };
}

// ==================================================================================================
// 6. Markdown
// ==================================================================================================
function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map(r => String(r[i] ?? '').length), 1));
  const line = cells => '| ' + cells.map((c, i) => String(c ?? '').padEnd(w[i])).join(' | ') + ' |';
  return [line(head), '|' + w.map(x => '-'.repeat(x + 2)).join('|') + '|', ...rows.map(line)].join('\n');
}
const cls = t => `a ${t.a} · b ${t.b} · c ${t.c}`;

export function renderMarkdown(o) {
  const L = [];
  L.push(`### ${o.repo}`, '');
  L.push(`tracked files ${o.files} · hand graph: ${o.graph.nodeTypes} node types, ${o.graph.nodes} nodes, ${o.graph.aspects} aspects · ` +
    `grain: ${o.grain.partitions} partitions, ${o.grain.modules} modules, ${o.grain.edges} file edges, ${o.grain.conventions} conventions · ` +
    `instrument wall ${o.wallSeconds}s`, '');

  const t = o.types;
  L.push('**(a) node types -> grain partitions / modules**', '');
  const strow = (name, s, key) => [name, s[key], s.ge50, s.ge80, s.meanJ, cls(s.classes)];
  L.push(table(['stratum', 'types', 'J>=0.5', 'J>=0.8', 'mean J', 'disagreements by class'], [
    ['all', t.classifyingTypes, t.ge50, t.ge80, t.meanJaccard, cls(t.disagreementClasses)],
    strow('source', t.byStratum.source, 'types'),
    strow('test-dominated', t.byStratum.test, 'types'),
    strow('grain parsed >=50% of the set', t.byStratum.grainParsed, 'types'),
    strow('grain parsed <50% (no grammar)', t.byStratum.grainNeverParsed, 'types'),
  ]), '');
  L.push(`organizational types (no \`when\` — nothing to recover): ${t.organizationalTypes} · unmeasurable (the when matches no tracked file): ${t.unmeasurable}`, '');
  L.push('worst-recovered types:', '');
  L.push(table(['type', 'files', 'best J', 'matched by', 'class'],
    t.rows.filter(r => r.best).slice(0, 12).map(r => [r.type, r.files, r.best.j, `${r.best.kind} ${r.best.name}`, r.verdict ? `${r.verdict.class} — ${r.verdict.label}` : 'agreement'])), '');

  const n = o.nodes;
  L.push('**(b) node `mapping:` -> grain partitions / modules / groups / directories**', '');
  L.push(table(['nodes with mapping', 'J>=0.5', 'J>=0.8', 'mean J', 'no mapping', 'unmeasurable', 'disagreements by class'],
    [[n.nodesWithMapping, n.ge50, n.ge80, n.meanJaccard, n.nodesWithoutMapping, n.unmeasurable, cls(n.disagreementClasses)]]), '');
  L.push(table(['stratum', 'nodes', 'J>=0.5', 'J>=0.8', 'mean J', 'disagreements by class'], [
    ['maps 1 file', n.byStratum.singleFile.nodes, n.byStratum.singleFile.ge50, n.byStratum.singleFile.ge80, n.byStratum.singleFile.meanJ, cls(n.byStratum.singleFile.classes)],
    ['maps 2-4 files', n.byStratum.twoToFour.nodes, n.byStratum.twoToFour.ge50, n.byStratum.twoToFour.ge80, n.byStratum.twoToFour.meanJ, cls(n.byStratum.twoToFour.classes)],
    ['maps 5+ files', n.byStratum.fivePlus.nodes, n.byStratum.fivePlus.ge50, n.byStratum.fivePlus.ge80, n.byStratum.fivePlus.meanJ, cls(n.byStratum.fivePlus.classes)],
    ['grain parsed <50% (no grammar)', n.byStratum.grainNeverParsed.nodes, n.byStratum.grainNeverParsed.ge50, n.byStratum.grainNeverParsed.ge80, n.byStratum.grainNeverParsed.meanJ, cls(n.byStratum.grainNeverParsed.classes)],
  ]), '');
  L.push('best match came from: ' + Object.entries(n.bestKindHistogram).map(([k, v]) => `${k} ${v}`).join(' · '), '');
  L.push('worst-recovered nodes:', '');
  L.push(table(['node', 'type', 'files', 'best J', 'matched by', 'class'],
    n.rows.filter(r => r.best).slice(0, 15).map(r => [r.node, r.type, r.files, r.best.j, `${r.best.kind} ${r.best.name}`, r.verdict ? `${r.verdict.class} — ${r.verdict.label}` : 'agreement'])), '');

  const r = o.relations;
  L.push('**(c) declared relations -> (module->module) pairs vs grain file edges**', '');
  L.push(table(['declared relations', 'declared pairs', 'grain pairs', 'matched', 'recall (raw)', 'recall (measurable)', 'precision (raw)'],
    [[r.declaredRelations, r.declaredPairs, r.grainPairs, r.matched, r.recallAll, r.recallMeasurable, r.precision]]), '');
  L.push(table(['disagreement', 'class', 'n'], [
    ['declared pair, textual backing exists, grain resolved no edge', 'a — miner miss', r.missClassA],
    ['declared pair with no code backing at HEAD at all', 'b — graph debt', r.missClassB],
    ['declared pair out of a module grain resolves nothing from', 'c — undecidable (coverage gap)', r.missClassC],
    ['grain-only pair the architecture allows but no node declares', 'b — graph debt', r.extraClassB],
    ['grain-only pair the architecture denies, or no dominant type', 'c — undecidable', r.extraClassC],
  ]), '');
  L.push(`relations whose target node has no file expansion: ${r.relationsWithNoFileExpansion} · declared relations that stay inside one grain module: ${r.declaredRelationsInsideOneModule}`, '');
  const nl = r.nodeLevel;
  L.push('the same comparison at the hand graph\'s OWN granularity (file owned by the node whose `mapping:` names it most specifically, both sides aggregated to node -> node):', '');
  L.push(table(['declared node pairs', 'grain node pairs', 'matched', 'recall', 'precision', 'files with an owning node'],
    [[nl.declaredPairs, nl.grainPairs, nl.matched, nl.recall, nl.precision, `${nl.filesWithAnOwningNode}/${nl.filesTracked}`]]), '');
  L.push(`\`archNorms exp:"false"\`: ${r.archNorms.falseNorms} — agrees with the architecture's own deny ${r.archNorms.agreesWithDeny} · contradicts an allow-list ${r.archNorms.contradictsAllowList} · unmeasurable ${r.archNorms.unmeasurable}`, '');

  const c = o.cycles;
  L.push('**(d) cycles**', '');
  L.push(c.adviseCycles == null
    ? `grain cycles ${c.grainCycles} · \`yg advise\` not run — unmeasurable ${c.unmeasurable}`
    : `grain cycles ${c.grainCycles} · advise loops ${c.adviseCycles} · matched at J>=0.5 ${c.matchedAtJ50} · recall ${c.recall} · advise-only ${c.adviseOnly} · grain-only ${c.grainOnly}`, '');

  const a = o.aspects;
  L.push('**(e) deterministic aspects -> grain conventions / group markers naming the same identifier**', '');
  L.push(table(['deterministic aspects', 'matched', 'a — miner miss', 'c — invisible by construction', 'unmeasurable', 'match rate (all)', 'match rate (measurable)', 'prose aspects (out of scope)'],
    [[a.deterministicAspects, a.matched, a.minerMiss, a.invisibleByConstruction, a.unmeasurable, a.matchRate, a.matchRateMeasurable, a.proseAspects]]), '');
  return L.join('\n');
}

// ==================================================================================================
// 7. main
// ==================================================================================================
export async function run(opts) {
  const repo = resolve(opts.repo);
  const t0 = Date.now();
  const say = m => { if (!opts.quiet) console.error('[reconstruct] ' + m); };

  const graph = readGraph(repo);
  const allFiles = gitFiles(repo);
  const excluded = (graph.config?.coverage?.excluded || []).map(p => pathMatcher(p));
  const files = allFiles.filter(rel => !excluded.some(m => m(rel)));
  say(`${repo}: ${files.length} tracked files (${allFiles.length - files.length} excluded by coverage.excluded), ` +
    `${Object.keys(graph.arch.node_types || {}).length} node types, ${graph.nodes.length} nodes, ${graph.aspects.length} aspects`);

  let exp;
  if (opts.exportPath) exp = JSON.parse(readFileSync(opts.exportPath, 'utf8'));
  else {
    say('running grain export ...');
    const out = join(repo, '.grain', 'reconstruct-export.json');
    const args = ['export', '--repo', repo, '--out', out, '--compact', '--no-anchors'];
    if (opts.noHistory) args.push('--no-history');
    execFileSync('node', [BIN, ...args], { encoding: 'utf8', maxBuffer: 1 << 29, timeout: 120 * 60_000, stdio: ['ignore', 'pipe', opts.quiet ? 'ignore' : 'inherit'] });
    exp = JSON.parse(readFileSync(out, 'utf8'));
  }

  const cache = loadCache(repo);
  const modOf = await moduleAssigner(exp, cache);
  const ctx = {
    root: repo, pathCache: new Map(), contentCache: new Map(), headCache: new Map(), unknownWhenKeys: new Set(),
    parsed: new Set(cache?.filesAll || []),       // the files grain has a grammar for and actually read
  };
  const cands = grainCandidates(exp, cache, modOf, files);

  // self-check: our module assignment must reproduce grain's own per-module file counts exactly
  const mine = new Map();
  for (const rel of cache?.filesAll || files) mine.set(modOf(rel), (mine.get(modOf(rel)) || 0) + 1);
  let moduleMismatch = 0;
  for (const nd of exp.moduleGraph?.nodes || []) if (mine.get(nd.id) !== nd.files) moduleMismatch++;

  let adviseText = null;
  if (opts.advisePath) adviseText = readFileSync(opts.advisePath, 'utf8');
  else if (opts.yg) {
    try { adviseText = execFileSync('node', [opts.yg, 'advise'], { cwd: repo, encoding: 'utf8', maxBuffer: 1 << 28 }); }
    catch (e) { adviseText = String(e.stdout || '') + String(e.stderr || ''); }
  }

  const out = {
    instrument: 'reconstruct/1',
    repo, asOf: new Date().toISOString(),
    files: files.length, filesExcluded: allFiles.length - files.length,
    graph: { nodeTypes: Object.keys(graph.arch.node_types || {}).length, nodes: graph.nodes.length, aspects: graph.aspects.length },
    grain: {
      partitions: (exp.partitions || []).length,
      modules: (exp.moduleGraph?.nodes || []).length,
      moduleEdges: (exp.moduleGraph?.edges || []).length,
      edges: (exp.edges || []).length,
      conventions: (exp.conventions || []).length,
      archNorms: (exp.archNorms || []).length,
      twins: (exp.twins || []).length,
      relCoverage: exp.relCoverage || null,
      partitionFileListsAvailable: !!(cache && cache.partitions),
      moduleAssignmentMismatch: moduleMismatch,
    },
    types: null, nodes: null, relations: null, cycles: null, aspects: null,
    unknownWhenKeys: [], wallSeconds: 0,
  };
  say('(a) types'); out.types = compareTypes(graph, files, ctx, cands, modOf);
  say('(b) node mappings'); out.nodes = compareNodes(graph, files, ctx, cands, modOf);
  say('(c) relations'); out.relations = compareRelations(graph, files, ctx, exp, modOf);
  say('(d) cycles'); out.cycles = compareCycles(exp, adviseText, graph, files, ctx, modOf);
  say('(e) aspects'); out.aspects = compareAspects(graph, files, ctx, exp);
  out.unknownWhenKeys = [...ctx.unknownWhenKeys];
  out.wallSeconds = +((Date.now() - t0) / 1000).toFixed(1);
  return out;
}

function parseArgs(argv) {
  const o = { md: false, quiet: false, exportPath: null, advisePath: null, yg: null, noHistory: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--md') o.md = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--export') o.exportPath = argv[++i];
    else if (a === '--advise') o.advisePath = argv[++i];
    else if (a === '--yg') o.yg = argv[++i];
    else if (a === '--no-history') o.noHistory = true;
    else pos.push(a);
  }
  if (!pos[0] || !pos[1]) {
    console.error('usage: reconstruct.mjs <repo-with-.yggdrasil> <out.json> [--md] [--export <json>] [--advise <txt>] [--yg <bin.js>] [--no-history]');
    process.exit(2);
  }
  o.repo = pos[0];
  o.out = pos[1];
  return o;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const o = parseArgs(process.argv.slice(2));
  run(o).then(res => {
    writeFileSync(o.out, JSON.stringify(res, null, 1));
    const t = res.types, n = res.nodes, r = res.relations, a = res.aspects;
    console.log(`[reconstruct] ${res.repo}: types ${t.ge50}/${t.classifyingTypes} at J>=0.5 (${t.ge80} at 0.8) · nodes ${n.ge50}/${n.nodesWithMapping} · ` +
      `relation pairs ${r.matched}/${r.declaredPairs} recall ${r.recallAll} precision ${r.precision} (miss a/b/c ${r.missClassA}/${r.missClassB}/${r.missClassC}) · ` +
      `cycles ${res.cycles.grainCycles} vs ${res.cycles.adviseCycles ?? 'n/a'} · aspects ${a.matched}/${a.deterministicAspects} matched · ${res.wallSeconds}s`);
    if (o.md) console.log('\n' + renderMarkdown(res));
    process.exit(0);
  }).catch(e => { console.error('[reconstruct] ' + (e?.stack || e)); process.exit(2); });
}
