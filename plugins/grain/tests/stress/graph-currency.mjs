#!/usr/bin/env node
// Graph currency at wave close (ticket 098) — turns the reconstruction instrument (093) into a DRIFT sensor a
// steward runs at every wave close, per the ecosystem design's I5 ("the graph stays current",
// ecosystem-design-2026-09-05.md §4.1): "graph-debt rows per 100 commits", instrument "reconstruct.mjs at wave
// close (098)".
//
// This is a THIN WRAPPER. Zero new reconstruction logic and zero engine changes: every comparison below is
// `reconstruct.mjs`'s own `compareTypes` / `compareNodes` / `compareRelations`, imported and read for the
// `verdict.class` they already compute (oracle-is-fallible-report-disagreements-symmetrically: (a) miner gap,
// (b) graph debt, (c) undecidable). The ONE new comparison here is (b)'s fourth item — "grain module with no
// owning node" — because currency needs the direction 093/094 never measured: not "does grain hold every hand
// element" but "does the hand graph still cover every locality the CODE has today".
//
//   node tests/stress/graph-currency.mjs <repo-with-.yggdrasil> <out.json> [--md]
//     [--export <grain export json>] [--no-history] [--quiet]
//     [--window <N=200>] [--skip-window] [--old-export <json>] [--old-repo <dir already at the old commit>]
//
// THE ONE NUMBER — graph-debt rows per 100 commits (I5). METHOD, stated so it can be checked: the debt-row
// count (types + nodes + relations + module-ownership rows classified (b)) is computed identically at HEAD and
// at HEAD~<window> (default 200 commits, or the whole history if shorter). The old state is a THROWAWAY clone
// of the same repo, `git checkout`ed to that commit, with its own `grain export` run inside it — never the
// repo passed on the command line, which stays read-only throughout. The delta between the two counts is
// scaled to a rate per 100 commits: `(debtAtHead - debtAtOld) / (window / 100)`. This is a TREND, not a
// snapshot — a hand graph that never moves while the code does will show a rising number; one a maintainer
// keeps current will sit near zero; paying down debt shows negative. Pass `--old-repo` to supply an
// already-checked-out old state yourself (a guard test's fixture, or a second worker's clone) instead of
// letting this script clone one.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  readGraph, subtreeFileSets, grainCandidates, moduleAssigner, bestMatch, pathMatcher,
  run as reconstructRun,
} from './reconstruct.mjs';

function gitFiles(repo) {
  return execFileSync('git', ['-C', repo, 'ls-files'], { encoding: 'utf8', maxBuffer: 1 << 28 }).split('\n').filter(Boolean);
}
function loadCache(repo) {
  try { return JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8')); } catch { return null; }
}
// the same `coverage.excluded` honouring reconstruct.mjs's own run() applies, re-derived here from its exported
// `pathMatcher` so this file makes no assumption about reconstruct.mjs's internals beyond its documented exports
function excludeCovered(graph, files) {
  const excluded = graph.config?.coverage?.excluded || [];
  if (!excluded.length) return files;
  const ms = excluded.map(p => pathMatcher(p));
  return files.filter(rel => !ms.some(m => m(rel)));
}

// ==================================================================================================
// (b) fourth item — grain module with no owning node.
//
// compareTypes/compareNodes ask "for every hand element, does grain hold this set somewhere". This asks the
// reverse: "for every grain module — a real, CURRENT locality in the code — does the hand graph cover it with
// something". Reuses the SAME J >= 0.5 bar this instrument family uses everywhere else (no new floor). A
// module under that bar is split further by how much of it is claimed by ANY hand node at all (not just the
// best one): under half claimed by anything is real graph debt (the hand graph does not know this part of the
// tree exists); over half claimed, just not by one dominant node, is a granularity call — undecidable, same
// discipline `classifyMiss` in reconstruct.mjs applies elsewhere.
//
// ONE EXEMPTION, TAKEN FROM YGGDRASIL'S OWN SEMANTICS, NOT INVENTED HERE: a module under `.yggdrasil/` itself.
// Measured on Yggdrasil (self-hosted): `.yggdrasil/model` (605 files, its own node/aspect/type YAML) and
// `.yggdrasil/flows` (18 files) score 0% owned by any node — not because the hand graph is behind, but because
// the graph's OWN definition is not, and structurally cannot sanely be, a node inside itself. Yggdrasil's own
// `cli/core/file-when-evaluator` node says so in its own description: "Auto-exempts .yggdrasil/ paths" — this
// is the CLI's own coverage rule, not a `coverage.excluded` config entry (which was empty on every measurement
// run here) and not something `reconstruct.mjs`'s file list already filters. Counting it as debt would be
// reporting an artifact of this new comparison, not a finding about the pattern repo, so the same directory is
// excluded here that Yggdrasil's own checker excludes. `.yggdrasil/aspects` is the one exception WITHIN the
// exemption: Yggdrasil's own `graph-rules` node deliberately maps `.yggdrasil/aspects/*/check.mjs` as ordinary
// source ("held to the graph's own rules like any other first-party source"), so that subtree is NOT skipped —
// an unowned `check.mjs` there would be a real, reportable gap.
// ==================================================================================================
const isGraphDefinitionModule = name => name === '.yggdrasil' || (name.startsWith('.yggdrasil/') && name !== '.yggdrasil/aspects' && !name.startsWith('.yggdrasil/aspects/'));

export function compareModuleOwnership(graph, files, ctx, cands) {
  const subtree = subtreeFileSets(graph, files, ctx);
  const nodeCands = [...subtree].map(([id, set]) => ({ kind: 'node', name: id, files: set }));
  const rows = [];
  for (const m of cands) {
    if (m.kind !== 'module' || !m.files.size || isGraphDefinitionModule(m.name)) continue;
    const best = bestMatch(m.files, nodeCands);
    const row = { module: m.name, files: m.files.size, best };
    if (best.j < 0.5) {
      let owned = 0;
      for (const f of m.files) { for (const set of subtree.values()) if (set.has(f)) { owned++; break; } }
      const ownedShare = m.files.size ? +(owned / m.files.size).toFixed(3) : 0;
      row.ownedShare = ownedShare;
      row.verdict = ownedShare < 0.5
        ? { class: 'b', label: 'graph debt (informational)', why: `only ${(ownedShare * 100).toFixed(0)}% of this module's ${m.files.size} files are claimed by ANY hand node's mapping — the module has no owning node in the hand graph` }
        : { class: 'c', label: 'undecidable (granularity)', why: `${(ownedShare * 100).toFixed(0)}% of the module is claimed by hand nodes, just not by one dominant node (best "${best.name}" at J=${best.j}) — a granularity difference between the module and however the hand graph split it` };
    }
    rows.push(row);
  }
  const ge50 = rows.filter(r => r.best.j >= 0.5).length;
  return {
    modules: rows.length, ge50,
    recallAt50: rows.length ? +(ge50 / rows.length).toFixed(3) : null,
    classes: { b: rows.filter(r => r.verdict?.class === 'b').length, c: rows.filter(r => r.verdict?.class === 'c').length },
    rows: rows.sort((a, b) => a.best.j - b.best.j),
  };
}

// ==================================================================================================
// The three-class wave-close report over ONE repo state.
// ==================================================================================================
export async function waveCloseReport(opts) {
  const res = await reconstructRun(opts); // types / nodes / relations / cycles / aspects — reconstruct's own

  const repo = resolve(opts.repo);
  const graph = readGraph(repo);
  const allFiles = gitFiles(repo);
  const files = excludeCovered(graph, allFiles);
  const exp = opts.exportPath
    ? JSON.parse(readFileSync(opts.exportPath, 'utf8'))
    : JSON.parse(readFileSync(join(repo, '.grain', 'reconstruct-export.json'), 'utf8'));
  const cache = loadCache(repo);
  const modOf = await moduleAssigner(exp, cache);
  const ctx = {
    root: repo, pathCache: new Map(), contentCache: new Map(), headCache: new Map(), unknownWhenKeys: new Set(),
    parsed: new Set(cache?.filesAll || []),
  };
  const cands = grainCandidates(exp, cache, modOf, files);
  const moduleOwnership = compareModuleOwnership(graph, files, ctx, cands);

  const debtRows = [
    ...res.types.rows.filter(r => r.verdict?.class === 'b').map(r => ({ source: 'type', id: r.type, files: r.files, why: r.verdict.why })),
    ...res.nodes.rows.filter(r => r.verdict?.class === 'b').map(r => ({ source: 'node', id: r.node, files: r.files, why: r.verdict.why })),
    ...res.relations.topMissB.map(r => ({ source: 'relation', id: `${r.from} -> ${r.to}`, why: r.why })),
    ...moduleOwnership.rows.filter(r => r.verdict?.class === 'b').map(r => ({ source: 'module', id: r.module, files: r.files, why: r.verdict.why })),
  ];
  const minerGapRows = [
    ...res.types.rows.filter(r => r.verdict?.class === 'a').map(r => ({ source: 'type', id: r.type, why: r.verdict.why })),
    ...res.nodes.rows.filter(r => r.verdict?.class === 'a').map(r => ({ source: 'node', id: r.node, why: r.verdict.why })),
    ...res.relations.topMissA.map(r => ({ source: 'relation', id: `${r.from} -> ${r.to}`, why: r.why })),
  ];
  const undecidableRows = [
    ...res.types.rows.filter(r => r.verdict?.class === 'c').map(r => ({ source: 'type', id: r.type, why: r.verdict.why })),
    ...res.nodes.rows.filter(r => r.verdict?.class === 'c').map(r => ({ source: 'node', id: r.node, why: r.verdict.why })),
    ...res.relations.topMissC.map(r => ({ source: 'relation', id: `${r.from} -> ${r.to}`, why: r.why })),
    ...res.relations.topExtraC.map(r => ({ source: 'relation (grain-only)', id: `${r.from} -> ${r.to}`, why: r.why })),
    ...moduleOwnership.rows.filter(r => r.verdict?.class === 'c').map(r => ({ source: 'module', id: r.module, why: r.verdict.why })),
  ];

  // exact counts, not the capped display lists above (reconstruct.mjs caps topMissA/B/C to 20/20/10 for
  // readability; the trend number must count every row, so it is tallied from the classes reconstruct.mjs
  // already totals, not from the length of the truncated arrays)
  const counts = {
    debt: res.types.disagreementClasses.b + res.nodes.disagreementClasses.b + res.relations.missClassB + moduleOwnership.classes.b,
    minerGap: res.types.disagreementClasses.a + res.nodes.disagreementClasses.a + res.relations.missClassA,
    undecidable: res.types.disagreementClasses.c + res.nodes.disagreementClasses.c + res.relations.missClassC + res.relations.extraClassC + moduleOwnership.classes.c,
    debtBySource: {
      type: res.types.disagreementClasses.b, node: res.nodes.disagreementClasses.b,
      relation: res.relations.missClassB, module: moduleOwnership.classes.b,
    },
  };

  return {
    instrument: 'graph-currency/1', repo, asOf: new Date().toISOString(),
    files: res.files, graph: res.graph, grain: res.grain,
    moduleOwnership, reconstruct: res,
    debtRows, minerGapRows, undecidableRows, counts,
  };
}

// ==================================================================================================
// Markdown — the wave-close artifact a steward reads.
// ==================================================================================================
function table(head, rows) {
  const w = head.map((h, i) => Math.max(String(h).length, ...rows.map(r => String(r[i] ?? '').length), 1));
  const line = cells => '| ' + cells.map((c, i) => String(c ?? '').padEnd(w[i])).join(' | ') + ' |';
  return [line(head), '|' + w.map(x => '-'.repeat(x + 2)).join('|') + '|', ...rows.map(line)].join('\n');
}

export function renderMarkdown(o) {
  const L = [];
  L.push(`### Graph currency — ${o.repo}`, '');
  L.push(`asOf ${o.asOf} · ${o.files} tracked files · hand graph: ${o.graph.nodeTypes} node types, ${o.graph.nodes} nodes, ${o.graph.aspects} aspects · ` +
    `grain: ${o.grain.partitions} partitions, ${o.grain.modules} modules`, '');
  L.push(`**(b) graph debt: ${o.counts.debt}** (type ${o.counts.debtBySource.type} · node ${o.counts.debtBySource.node} · relation ${o.counts.debtBySource.relation} · module ${o.counts.debtBySource.module}) · ` +
    `(a) miner gaps: ${o.counts.minerGap} · (c) undecidable: ${o.counts.undecidable}`, '');
  if (o.debtRows.length) {
    L.push('graph debt rows (declared relation with no code backing; type/node `when`/`mapping` no longer matching any grain cut at J>=0.5; grain module with no owning node):', '');
    L.push(table(['source', 'id', 'why'], o.debtRows.map(r => [r.source, r.id, r.why])), '');
  }
  if (o.window) {
    if (o.window.skipped) L.push(`**graph-debt rows per 100 commits: not measured** (${o.window.why})`, '');
    else L.push(`**graph-debt rows per 100 commits: ${o.window.debtRowsPer100Commits}** — debt at HEAD ${o.window.debtAtHead}, at HEAD~${o.window.commits} (${o.window.oldSha?.slice(0, 10) ?? '?'}) ${o.window.debtAtOld}, delta ${o.window.deltaDebtRows} over ${o.window.commits} commits. ${o.window.method}`, '');
  }
  return L.join('\n');
}

// ==================================================================================================
// main — orchestrates the two-state comparison the trend number needs.
// ==================================================================================================
function commitCount(repo) {
  return parseInt(execFileSync('git', ['-C', repo, 'rev-list', '--count', 'HEAD'], { encoding: 'utf8' }).trim(), 10);
}

function parseArgs(argv) {
  const o = {
    md: false, quiet: false, exportPath: null, noHistory: false,
    window: 200, skipWindow: false, oldExportPath: null, oldRepo: null,
  };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--md') o.md = true;
    else if (a === '--quiet') o.quiet = true;
    else if (a === '--export') o.exportPath = argv[++i];
    else if (a === '--no-history') o.noHistory = true;
    else if (a === '--window') o.window = parseInt(argv[++i], 10);
    else if (a === '--skip-window') o.skipWindow = true;
    else if (a === '--old-export') o.oldExportPath = argv[++i];
    else if (a === '--old-repo') o.oldRepo = argv[++i];
    else pos.push(a);
  }
  if (!pos[0] || !pos[1]) {
    console.error('usage: graph-currency.mjs <repo-with-.yggdrasil> <out.json> [--md] [--export <json>] [--no-history]\n' +
      '  [--window <N=200>] [--skip-window] [--old-export <json>] [--old-repo <dir>]');
    process.exit(2);
  }
  o.repo = pos[0];
  o.out = pos[1];
  return o;
}

export async function run(o) {
  const say = m => { if (!o.quiet) console.error('[graph-currency] ' + m); };
  say(`head: ${o.repo}`);
  const head = await waveCloseReport({ repo: o.repo, exportPath: o.exportPath, noHistory: o.noHistory, quiet: o.quiet });

  let windowOut = null;
  if (!o.skipWindow) {
    let oldRepo = o.oldRepo;
    let cleanupDir = null;
    let commits = o.window;
    let oldSha = null;
    if (!oldRepo) {
      const total = commitCount(o.repo);
      commits = Math.min(o.window, Math.max(total - 1, 0));
      if (commits <= 0) {
        windowOut = { skipped: true, why: `repo has only ${total} commit(s) of history — nothing ${o.window} commits back` };
      } else {
        oldSha = execFileSync('git', ['-C', o.repo, 'rev-parse', `HEAD~${commits}`], { encoding: 'utf8' }).trim();
        const dir = mkdtempSync(join(tmpdir(), 'graph-currency-old-'));
        cleanupDir = dir;
        say(`old state: cloning to ${dir} and checking out ${oldSha.slice(0, 10)} (HEAD~${commits})`);
        execFileSync('git', ['clone', '--quiet', o.repo, dir], { stdio: ['ignore', 'ignore', o.quiet ? 'ignore' : 'inherit'] });
        execFileSync('git', ['-C', dir, 'checkout', '--quiet', oldSha], { stdio: ['ignore', 'ignore', o.quiet ? 'ignore' : 'inherit'] });
        oldRepo = dir;
      }
    } else {
      oldSha = execFileSync('git', ['-C', oldRepo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    }
    if (oldRepo && !windowOut?.skipped) {
      say(`old: ${oldRepo}`);
      const old = await waveCloseReport({ repo: oldRepo, exportPath: o.oldExportPath, noHistory: o.noHistory, quiet: o.quiet });
      windowOut = {
        commits, oldSha,
        debtAtHead: head.counts.debt, debtAtOld: old.counts.debt,
        deltaDebtRows: head.counts.debt - old.counts.debt,
        debtRowsPer100Commits: commits ? +((head.counts.debt - old.counts.debt) / (commits / 100)).toFixed(2) : null,
        method: `debt rows counted identically at HEAD and at HEAD~${commits} (a throwaway clone, \`git checkout\`ed, own \`grain export\`), delta scaled to a rate per 100 commits: (debtAtHead - debtAtOld) / (${commits} / 100).`,
        oldCounts: old.counts,
      };
      if (cleanupDir) rmSync(cleanupDir, { recursive: true, force: true });
    }
  } else {
    windowOut = { skipped: true, why: '--skip-window' };
  }

  return { ...head, window: windowOut };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const o = parseArgs(process.argv.slice(2));
  run(o).then(out => {
    writeFileSync(o.out, JSON.stringify(out, null, 1));
    const w = out.window;
    console.log(`[graph-currency] ${out.repo}: debt ${out.counts.debt} (type ${out.counts.debtBySource.type} · node ${out.counts.debtBySource.node} · relation ${out.counts.debtBySource.relation} · module ${out.counts.debtBySource.module}) · ` +
      `miner-gap ${out.counts.minerGap} · undecidable ${out.counts.undecidable}` +
      (w && !w.skipped ? ` · graph-debt rows/100 commits: ${w.debtRowsPer100Commits}` : w ? ` · window: ${w.why}` : ''));
    if (o.md) console.log('\n' + renderMarkdown(out));
    process.exit(0);
  }).catch(e => { console.error('[graph-currency] ' + (e?.stack || e)); process.exit(2); });
}
