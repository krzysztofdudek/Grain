#!/usr/bin/env node
// The proposal instrument (G'') — a thin CLI wrapper around the renderer, plus the one thing only a measurement
// run needs: SCORING a rendered proposal against a repository's HAND-WRITTEN `.yggdrasil/`.
//
// The renderer itself moved to `engine/propose.mjs` when `grain propose` became a product command (ticket 104).
// Nothing about the rendering changed with the move — this file re-exports every name it used to export, from
// there, so `integration-stress.mjs`, `law-loop.mjs`, `propose.test.mjs` and `integration-stress.test.mjs`
// import exactly what they imported before, and the CLI below keeps every flag it had.
//
//   node tests/stress/propose.mjs <repo> <out-dir> [--export <json>] [--no-history]
//
// Options:
//   --export <path>   reuse an existing `grain export` JSON instead of spawning one
//   --no-history      pass --no-history through to `grain export`
//   --holdout <date>  cut the drill corpora with a TIME hold-out: keep only sites whose first appearance
//                     post-dates that date. Without it every corpus says, in its own CORPUS.md, that rule and
//                     drill are the same data.
//   --subgate-per-partition <n>
//                     override SUBGATE_PER_PARTITION, the READING cap on how many sub-gate candidates a
//                     maintainer is asked to look at per partition. It bounds presentation, not measurement, so
//                     a measurement run (097) lifts it and says so.
//   --score <repo>    after writing, score the proposal against that repo's HAND-WRITTEN `.yggdrasil/`, in BOTH
//                     directions (recall: hand element -> proposed element; precision: proposed -> hand)
//   --json <path>     write the run's numbers (and the score, with --score) as JSON
//   --quiet           no progress on stderr
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseYaml, readGraph, expandWhen, expandMapping, jaccard, aspectLiterals } from './reconstruct.mjs';
import {
  propose as enginePropose,
  promoteEnforceableAspects as enginePromote,
} from '../../engine/propose.mjs';
// imported AND re-exported, not `export … from`: the scoring section and the CLI below call several of these by
// name, and a bare re-export would leave them undefined in this module's own scope
import {
  PREAMBLE, RENDERABLE, WHY_PROSE, SUPERMAJORITY, LAMBDA_BOUND, MIN_SUPPORT, MIN_PROMOTE_FILES,
  MIN_GROUP_MEMBERS, MIN_WHEN_FIDELITY, MIN_CONVENTION_SITES, FAMILY_MIN_MEMBERS, SUBGATE_PER_PARTITION,
  slug, yq, yamlEmit, localities, contentRegexFor, caseTolerant, buildTypes, buildRelations, buildNodes,
  nestedProjectRoots, nodePathFor, partitionLattice, subGate, identifierOf, shapeToRegex, renderCheck,
  renderableDirection, computeSizing, buildAspects, provenanceFor, buildFamilyCandidates, nodeCochangePairs,
  renderNodeCharter, cutDrills, resolveYg, proposeReport,
} from '../../engine/propose.mjs';
export {
  PREAMBLE, RENDERABLE, WHY_PROSE, SUPERMAJORITY, LAMBDA_BOUND, MIN_SUPPORT, MIN_PROMOTE_FILES,
  MIN_GROUP_MEMBERS, MIN_WHEN_FIDELITY, MIN_CONVENTION_SITES, FAMILY_MIN_MEMBERS, SUBGATE_PER_PARTITION,
  slug, yq, yamlEmit, localities, contentRegexFor, caseTolerant, buildTypes, buildRelations, buildNodes,
  nestedProjectRoots, nodePathFor, partitionLattice, subGate, identifierOf, shapeToRegex, renderCheck,
  renderableDirection, computeSizing, buildAspects, provenanceFor, buildFamilyCandidates, nodeCochangePairs,
  renderNodeCharter, cutDrills, resolveYg, proposeReport,
};

// Where the built Yggdrasil CLI lives for a MEASUREMENT run on this machine — the same path
// `tests/propose.test.mjs` and `tests/stress/integration-stress.mjs` already use as their own default: `YG_BIN`
// first, this path otherwise. It stays in the instrument and never in the product command, which resolves
// `YG_BIN` or a `yg` on PATH and says so when it finds neither (`resolveYg`, engine/propose.mjs).
const DEFAULT_YG_BIN = '/home/user/Yggdrasil/source/cli/dist/bin.js';
// The two entry points that reach a drill get the instrument's own default injected; an explicit `ygBin` in the
// caller's options still wins. Everything else is re-exported untouched above.
export const propose = (repo, outDir, opts = {}) =>
  enginePropose(repo, outDir, { ygBin: process.env.YG_BIN || DEFAULT_YG_BIN, ...opts });
export const promoteEnforceableAspects = (aspects, o = {}) =>
  enginePromote(aspects, { ygBin: process.env.YG_BIN || DEFAULT_YG_BIN, ...o });

// progress on stderr, the renderer's own one-liner — the instrument's runs are long and a silent hour is worse
// than eight lines of stderr
const say = (opts, m) => { if (!opts.quiet) process.stderr.write(`[propose] ${m}\n`); };


// ==================================================================================================
// 9. Scoring — BOTH directions, at BOTH granularities.
//
// recall:    for each element of the HAND graph, is there a proposed element at J >= 0.5?
// precision: for each PROPOSED element, is there a hand element at J >= 0.5?
//
// The same fallibility rule as `reconstruct.mjs` applies (`oracle-is-fallible-report-disagreements-symmetrically`):
// a proposed element with no hand counterpart is not automatically wrong. It is reported as a raw disagreement.
// ==================================================================================================

export function scoreProposal(handRepo, outDir, files) {
  const hand = readGraph(handRepo);
  const prop = readGraph(outDir);
  const ctx = { root: handRepo, pathCache: new Map(), contentCache: new Map(), headCache: new Map(), unknownWhenKeys: new Set(), parsed: new Set() };

  const setsOf = graph => {
    const types = [];
    for (const [id, t] of Object.entries(graph.arch?.node_types || {})) {
      if (!t || !t.when) continue;
      const s = expandWhen(t.when, files, ctx);
      if (s.size) types.push({ id, files: s });
    }
    const nodes = [];
    for (const n of graph.nodes) {
      const s = expandMapping(n.mapping, files, ctx);
      if (s.size) nodes.push({ id: n.id, files: s });
    }
    return { types, nodes };
  };
  const H = setsOf(hand), P = setsOf(prop);
  // the proposal's alternatives are candidates the maintainer chooses from, so they are scored as a separate,
  // clearly-labelled stratum — never folded into the active number.
  let alts = [];
  const altFile = join(outDir, 'alternatives.md');
  if (existsSync(altFile)) {
    const txt = readFileSync(altFile, 'utf8');
    for (const m of txt.matchAll(/^### `([^`]+)`\n\n```yaml\n([\s\S]*?)\n```/gm)) {
      try {
        const w = parseYaml(m[2]);
        const s = expandWhen(w.when, files, ctx);
        if (s.size) alts.push({ id: m[1], files: s });
      } catch { /* a draft predicate that does not parse is itself a finding, counted below */ }
    }
  }

  const direction = (from, to, label) => {
    const rows = from.map(x => {
      let best = { j: 0, id: null };
      for (const y of to) { const j = jaccard(x.files, y.files); if (j > best.j) best = { j: +j.toFixed(4), id: y.id }; }
      return { id: x.id, files: x.files.size, best: best.j, match: best.id };
    });
    return { label, n: rows.length, hit: rows.filter(r => r.best >= 0.5).length, hit8: rows.filter(r => r.best >= 0.8).length, meanJ: +(rows.reduce((a, r) => a + r.best, 0) / Math.max(1, rows.length)).toFixed(3), rows };
  };

  const typeRecall = direction(H.types, P.types, 'hand type -> proposed type (recall)');
  const typeRecallWithAlts = direction(H.types, [...P.types, ...alts], 'hand type -> proposed type or alternative (recall, ceiling)');
  const typePrecision = direction(P.types, H.types, 'proposed type -> hand type (precision)');
  const nodeRecall = direction(H.nodes, P.nodes, 'hand node -> proposed node (recall)');
  const nodePrecision = direction(P.nodes, H.nodes, 'proposed node -> hand node (precision)');

  // aspects: how many drafts name an identifier a hand-written mechanical rule also names
  const handLits = new Map();
  for (const a of hand.aspects) {
    if (!a.hasCheck) continue;
    let lits;
    try { lits = aspectLiterals(readFileSync(join(a.dir, 'check.mjs'), 'utf8')); } catch { lits = new Set(); }
    handLits.set(a.id, lits);
  }
  // A draft's identifier is the ONE name its rule is about — the convention's own `feature.argument`, recorded
  // in `proposal.json` when the aspect was written. Scanning the drafted prose for every backticked token
  // instead would count a shared English word as a hit and inflate this number; it was measured doing exactly
  // that (14/37 by loose token match, against the tight count below) before this was tightened.
  const draftIdents = new Map();
  const sidecar = JSON.parse(readFileSync(join(outDir, 'proposal.json'), 'utf8'));
  for (const row of sidecar.evidence || []) {
    if (row.kind !== 'aspect' || !row.identifier) continue;
    draftIdents.set(row.id, new Set([row.identifier]));
  }
  const key = s => String(s).split(/[^A-Za-z0-9]+/).filter(Boolean).join('').toLowerCase();
  const handKeyed = new Map([...handLits].map(([id, s]) => [id, new Set([...s].map(key))]));
  const aspectHits = [];
  for (const [hid, hs] of handKeyed) {
    if (!hs.size) continue;
    const drafts = [...draftIdents].filter(([, ds]) => [...ds].some(d => hs.has(key(d))));
    if (drafts.length) aspectHits.push({ handAspect: hid, drafts: drafts.map(([d]) => d).slice(0, 4), n: drafts.length });
  }

  return {
    types: { recall: typeRecall, recallWithAlternatives: typeRecallWithAlts, precision: typePrecision },
    nodes: { recall: nodeRecall, precision: nodePrecision },
    aspects: { handDeterministic: handLits.size, handWithLiterals: [...handKeyed.values()].filter(s => s.size).length, drafts: prop.aspects.length, named: aspectHits.length, rows: aspectHits },
    alternatives: alts.length,
  };
}

// ==================================================================================================
// 10. CLI.
// ==================================================================================================

function parseArgs(argv) {
  const pos = [], opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--quiet') opts.quiet = true;
    else if (a === '--no-history') opts.noHistory = true;
    else if (a === '--export') opts.exportPath = resolve(argv[++i]);
    else if (a === '--score') opts.score = resolve(argv[++i]);
    else if (a === '--json') opts.json = resolve(argv[++i]);
    else if (a === '--holdout') opts.holdout = argv[++i];
    else if (a === '--subgate-per-partition') opts.subGatePerPartition = Number(argv[++i]);
    else if (a === '--family-candidates') opts.familyCandidates = resolve(argv[++i]);
    else if (a.startsWith('--')) throw new Error(`unknown flag ${a}`);
    else pos.push(a);
  }
  if (opts.holdout && !/^\d{4}-\d{2}-\d{2}$/.test(opts.holdout)) throw new Error('--holdout takes a YYYY-MM-DD date');
  if (pos.length !== 2) throw new Error('usage: node propose.mjs <repo> <out-dir> [--export <json>] [--no-history] [--holdout <YYYY-MM-DD>] [--subgate-per-partition <n>] [--score <repo>] [--json <path>] [--family-candidates <out.json>] [--quiet]');
  return { repo: resolve(pos[0]), outDir: resolve(pos[1]), opts };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const { repo, outDir, opts } = parseArgs(process.argv.slice(2));
  if (resolve(outDir) === resolve(repo) || resolve(outDir).startsWith(resolve(repo, '.yggdrasil'))) {
    throw new Error('refusing to write into the repository\'s own .yggdrasil/ — a proposal is read by a human, never installed by a script');
  }
  const t0 = Date.now();
  const r = await propose(repo, outDir, opts);
  const out = { instrument: 'propose/1', repo, outDir, wallSeconds: +((Date.now() - t0) / 1000).toFixed(1), counts: JSON.parse(readFileSync(join(outDir, 'proposal.json'), 'utf8')).counts };
  if (opts.familyCandidates) {
    const fc = buildFamilyCandidates(r.alternatives, r.exp, {}, { active: r.active, groups: r.loc.groups, repo });
    // `_fit` is this instrument's own bookkeeping, not part of the `.family-candidates.json` contract yg advise
    // reads — it is reported here and never written to the file.
    const { _fit, ...onDisk } = fc;
    writeFileSync(opts.familyCandidates, JSON.stringify(onDisk, null, 1) + '\n');
    out.familyCandidates = { path: opts.familyCandidates, families: fc.families.length, predicateFit: _fit || null };
    process.stdout.write(`[propose] family candidates: ${fc.families.length} written to ${opts.familyCandidates}`
      + (_fit && (_fit.members || _fit.families) ? ` (predicate-fit gate dropped ${_fit.members} member(s) and ${_fit.families} whole family/families)` : '') + '\n');
  }
  if (opts.score) {
    say(opts, 'scoring against the hand-written graph ...');
    out.score = scoreProposal(opts.score, outDir, r.files);
    const t = out.score.types, n = out.score.nodes;
    say(opts, `types recall ${t.recall.hit}/${t.recall.n} (with alternatives ${t.recallWithAlternatives.hit}/${t.recallWithAlternatives.n}) · precision ${t.precision.hit}/${t.precision.n}`);
    say(opts, `nodes recall ${n.recall.hit}/${n.recall.n} · precision ${n.precision.hit}/${n.precision.n}`);
    say(opts, `aspects: ${out.score.aspects.named}/${out.score.aspects.handWithLiterals} hand mechanical rules named by some draft`);
  }
  if (opts.json) writeFileSync(opts.json, JSON.stringify(out, null, 1) + '\n');
  process.stdout.write(`[propose] ${outDir}: ${out.counts.types} types · ${out.counts.nodes} nodes · ${out.counts.aspects} aspect drafts · ${out.counts.alternatives} alternatives · ${out.wallSeconds}s\n`);
}
