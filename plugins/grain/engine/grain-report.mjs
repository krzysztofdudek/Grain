// grain engine · query surface · `status`, `report` and `rules`, and the freshness lines they end with
// Split out of grain.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { join, resolve, isAbsolute } from 'node:path';
import {
  report,
  rulesMarkdown,
  statusLines,
  verbalize,
  scopeLabel,
  factLabel,
  moduleLayers,
  relCoverageData,
} from './core.mjs';
import { DIRTY_TREE_NOTE } from './core.mjs';
import { atomicWrite, readJson, short } from './grain-context.mjs';

export function freshnessLines(meta, head, isGit) {
  const l = [];
  if (!isGit) l.push('freshness: no git repository — index keyed on file sizes/mtimes');
  else
    l.push(
      `freshness: indexed HEAD ${short(meta?.headSha)} · current HEAD ${short(head)} · ${meta?.headSha === head ? 'up to date' : 'STALE'} · history ${meta?.historyMode || '?'}${meta?.historyReason ? ` (${meta.historyReason})` : ''}`
    );
  if (meta)
    l.push(
      `index: engine ${meta.engine} · extractor ${meta.extractor} · grammars ${meta.grammars} · built ${meta.builtAt} in ${meta.buildMs}ms`
    );
  return l;
}
export async function cmdStatus({ model, meta, head, isGit, stamp, args, opts, store, treeDirty }) {
  if (args.length) throw new Error('usage: grain status [--json] — takes no arguments');
  const sig = signal(model);
  if (opts.json)
    return [
      JSON.stringify({
        repo: model.repo,
        files: model.files,
        partitions: model.partitions.map(p => ({
          name: p.name,
          label: scopeLabel(p.name),
          files: p.files.length,
          scopes: p.scopes,
          groups: p.medoids.length,
          conventions: p.facts.length,
        })),
        signal: sig,
        agentShare: model.agentShare,
        cochangePairs: model.cochange.length,
        history: model.historyStats,
        freshness: {
          indexedHead: meta?.headSha || null,
          head,
          upToDate: meta?.headSha === head,
          historyMode: meta?.historyMode || null,
          builtAt: meta?.builtAt || null,
          engine: meta?.engine,
          extractor: meta?.extractor,
        },
        asOf: stamp().replace(/^as of /, ''),
      }),
    ];
  return [
    ...statusLines(model),
    `signal: ${sig.facts} conventions over ${sig.files} source files — ${sig.verdict}`,
    ...placementOutcomeLine(store),
    ...checkOutcomeLine(store),
    ...freshnessLines(meta, head, isGit),
    ...(treeDirty ? [DIRTY_TREE_NOTE] : []),
    stamp(),
  ];
}
// self-observability, not a repo convention — belongs beside status's own freshness/health lines, not in `report`'s
// "here is what this repo practices" surface. Silent (no "0 of 0" noise) until at least one suggestion has resolved.
function placementOutcomeLine(store) {
  const out = readJson(join(store.dir, 'placement-outcomes.json'));
  const total = out ? out.followed + out.deviated : 0;
  return total
    ? [`placement notes followed: ${out.followed} of ${total} (${Math.round((out.followed / total) * 100)}%)`]
    : [];
}
// self-observability, same shape as placementOutcomeLine above. Silent until at least one deviation has resolved.
function checkOutcomeLine(store) {
  const out = readJson(join(store.dir, 'check-outcomes.json'));
  const total = out ? out.acted + out.ignored : 0;
  return total
    ? [`check notes acted on: ${out.acted} of ${total} (${Math.round((out.acted / total) * 100)}%)`]
    : [];
}
export async function cmdReport({ model, meta, head, isGit, args, opts, stamp, store, treeDirty }) {
  if (args.length) throw new Error('usage: grain report [--top N] [--json] — takes no arguments');
  if (opts.json)
    return [
      JSON.stringify({
        repo: model.repo,
        partitions: model.partitions.map(p => ({
          name: p.name,
          label: scopeLabel(p.name),
          conventions: p.facts.slice(0, +opts.top || 15).map(f => ({
            id: p.name + '::' + f.cid + '::' + f.pid,
            context: factLabel(p, f),
            kind: f.kind,
            pid: f.pid,
            expected: f.exp,
            statement: verbalize(
              f,
              f.exemplars.map(e => e.name)
            ),
            share: f.share,
            established: f.sraw,
            deviantsN: f.deviantsN,
            deviants: f.deviants || [],
            exemplars: f.exemplars,
            trend: f.trend
              ? { shares: f.trend.shares.map(x => x.share), nucleating: f.trend.nucleating }
              : null,
            held: f.held || null,
          })),
          total: p.facts.length,
        })),
        // ticket 072: `report` (text, report() in core.mjs) also renders an `== architecture — N modules · N
        // directed dependencies · N cycle(s) ==` section — modules, their layer placement, directed dependency
        // edges, cycles, and the relation-resolution coverage note (§G21) — none of which `--json` carried before
        // this, a strictly poorer machine-readable answer than the human-readable one for a published-interface
        // command (same failure family as §041/§051/§066/§059). Additive only (no existing field touched):
        // `modules`/`edges` are the same `model.moduleGraph` arrays `map --json` already surfaces (§066/051,
        // `nodes`/`edges` there); `layers` reuses `moduleLayers()` — the same grouping mapSections' own text
        // `layers:` line computes, here UNCAPPED (mapSections' 4-per-layer "+K more" cap is a display concern, the
        // same relationship cmdMap's `changes` field already has to its own text line's top-4 slice); `cycles` is
        // `model.moduleGraph.cycles` verbatim; `relCoverage` is the identical `{n, grammars}` shape `export --json`
        // already publishes for the SAME fact `report`'s own coverage-note text line states in prose.
        modules: (model.moduleGraph?.nodes || []).map(n => ({ id: n.id, layer: n.layer })),
        edges: (model.moduleGraph?.edges || []).map(e => ({ from: e.from, to: e.to, n: e.n })),
        layers: moduleLayers(model),
        cycles: model.moduleGraph?.cycles || [],
        relCoverage: relCoverageData(model),
        asOf: stamp().replace(/^as of /, ''),
      }),
    ];
  const outcomes = readJson(join(store.dir, 'check-outcomes.json'));
  return [
    ...report(model, { top: +opts.top || 15, outcomes }),
    ...freshnessLines(meta, head, isGit),
    ...(treeDirty ? [DIRTY_TREE_NOTE] : []),
    stamp(),
  ];
}
// a generated Markdown document for a reader with no terminal and no grain plugin (a human maintainer, or a
// coding tool this plugin is not installed in) — the same model data `report()` renders, formatted as a
// standalone snapshot instead of context-window lines. `--out` writes the file and answers with a short
// confirmation only (never both the file AND the whole document on stdout); with no `--out`, the document goes
// straight to stdout so `grain rules > CONVENTIONS.md` already works without a flag — matching `export`'s own
// `--out`-vs-stdout split, including keeping the freshness stamp off stdout in the redirection path so it never
// lands inside the written document.
export async function cmdRules({ model, isGit, head, args, opts, stamp, store, treeDirty }) {
  if (args.length) throw new Error('usage: grain rules [--out <file>] [--top N] — takes no arguments');
  const outcomes = readJson(join(store.dir, 'check-outcomes.json'));
  // `dirty` here is a document-content fact (§024c), the same footing as `sha`/`date` just above it — not the
  // CLI's own ephemeral stamp(), which stays off stdout in the no-`--out` path below on purpose (see the note atop
  // this function): the generated document should say so wherever it ends up, `--out` file included.
  const text = rulesMarkdown(model, {
    top: +opts.top || 15,
    sha: short(isGit ? head : null),
    date: new Date().toISOString().slice(0, 10),
    outcomes,
    dirty: treeDirty,
  }).join('\n');
  if (opts.out) {
    const p = isAbsolute(opts.out) ? opts.out : resolve(process.cwd(), opts.out);
    atomicWrite(p, text + '\n');
    const n = model.partitions.reduce((a, pt) => a + pt.facts.length, 0);
    return [`wrote ${n} convention(s) to ${p}`, ...(treeDirty ? [DIRTY_TREE_NOTE] : []), stamp()];
  }
  console.error('[grain] ' + stamp());
  return [text];
}
// how much the model can say about the code, as a verdict a reader can calibrate on — "16 conventions over 150 files"
// is a sparse model and the agent cannot know that from the count alone
export function signal(model) {
  const src = model.partitions;
  const facts = src.reduce((a, p) => a + p.facts.length, 0),
    groups = src.reduce((a, p) => a + p.medoids.length, 0),
    files = src.reduce((a, p) => a + (p.files || []).length, 0);
  const per100 = files ? (facts / files) * 100 : 0;
  const verdict = !src.length
    ? 'no source partition — nothing is spoken here'
    : facts === 0
      ? 'an empty model — placement only, no shape; read an exemplar'
      : per100 < 8
        ? 'a sparse model — expect placement, not shape; read an exemplar'
        : per100 < 25
          ? 'a moderate model'
          : 'a rich model';
  return { facts, groups, files, verdict };
}
