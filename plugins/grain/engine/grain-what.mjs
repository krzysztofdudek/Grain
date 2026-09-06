// grain engine · query surface · `what`, `map` and `obligation`
// Split out of grain.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { obligationFor, obligationLines, whatCmd, mapSections } from './core.mjs';
import { loadHistory } from './history.mjs';
import { DIRTY_TREE_NOTE } from './core.mjs';
import { existsMemo, loadScopes, log, relPath } from './grain-context.mjs';
import { findBlindHit, findUngrammaredHit } from './grain-where.mjs';

export async function cmdWhat({ model, root, isGit, args, opts, stamp, store, treeDirty }) {
  if (!args.length) throw new Error('usage: grain what <words>');
  const query = args.join(' ');
  let H = null;
  if (isGit && !opts['no-history']) {
    try {
      H = (await loadHistory({ gitdir: root, store, log })).H;
    } catch (e) {
      log('history unavailable for what: ' + e.message);
    }
  }
  // (§011) the current tree's already-cached scope snapshot (loadScopes — no re-parsing, the same infra `export`
  // already reads on every call) — lets whatCmd tell "seen but below the value-index's df floor" from "never
  // seen" when the plain answer would otherwise be empty.
  const rawScopes = await loadScopes({ root, isGit, store, opts });
  let res = whatCmd({ model, H, query, exemplarOk: existsMemo(root), rawScopes });
  // Two paths pay for the bounded blind-file re-scan, and only these two: the truly-empty answer (§018, loose
  // substring — a "nothing found" answer cannot be made overconfident by a hedge), and the WEAK answer §037
  // describes, where nothing returned actually carries the queried name (strict — it interrupts a real answer).
  // Every other query, including every one with an exact-name hit, never opens a file at all.
  if (res.note?.kind === 'absent') {
    // §057 — the truly-empty case tries the ungrammared (never-parsed) set FIRST: a deterministic, stronger
    // claim than the peer-anomalous blind-file heuristic below, and gatedValueEvidence (checked inside whatCmd
    // itself, no I/O) already had first refusal — `note.kind` is only 'absent' here because that already came
    // back empty.
    const ungrammaredHit = findUngrammaredHit(model, root, query);
    if (ungrammaredHit) res = whatCmd({ model, H, query, exemplarOk: existsMemo(root), rawScopes, ungrammaredHit });
    else {
      const blindHit = findBlindHit(model, root, query, false);
      if (blindHit) res = whatCmd({ model, H, query, exemplarOk: existsMemo(root), rawScopes, blindHit });
    }
  } else if (res.weakName) {
    const blindHit = findBlindHit(model, root, query, true);
    if (blindHit) res = whatCmd({ model, H, query, exemplarOk: existsMemo(root), rawScopes, blindHit });
  }
  const { lines, defined, values, spread, changes, usedBy, referenced, testedBy, note, disclosures } = res;
  if (opts.json)
    return [
      JSON.stringify({
        query,
        defined,
        values,
        spread,
        changes,
        usedBy,
        referenced: referenced || null,
        testedBy: testedBy || null,
        note: note && note.kind !== 'absent' ? note : null,
        // §089 — additive: the same { kind, text } hedges the text renderer below already emits, plus dirty-tree
        // (a HEAD-reading command never claims `+dirty`, but text already discloses a dirty worktree via
        // DIRTY_TREE_NOTE below — JSON never carried it at all until now).
        disclosures: treeDirty ? [...disclosures, { kind: 'dirty-tree', text: DIRTY_TREE_NOTE }] : disclosures,
        asOf: stamp().replace(/^as of /, ''),
      }),
    ];
  return [...lines, ...(treeDirty ? [DIRTY_TREE_NOTE] : []), stamp()];
}
// `map` (§J4.3a) — a structural overview: dependency layers (leaves to top) and how many maintainer decisions are
// in force. Pure model reads, no history — `mapSections` is the shared renderer `--json` mirrors as data.
export async function cmdMap({ model, args, opts, stamp, treeDirty }) {
  if (args.length)
    throw new Error(
      'usage: grain map [--json] — takes no file argument; for one file, use `grain explain <file>` (or `spectrum`)'
    );
  if (opts.json)
    return [
      JSON.stringify({
        nodes: (model.moduleGraph?.nodes || []).map(n => ({ id: n.id, layer: n.layer })),
        // §066/051: `map` (text, mapSections) also renders `concepts:` and `changes:` (from model.changeArchetypes,
        // there truncated to the top 4 for a scannable line) and derives its `layers:` line from the module
        // dependency graph — `--json` carried none of the three, a strictly poorer machine-readable answer than
        // the human-readable one for a published-interface command. Additive only (no existing field touched):
        // `concepts`/`edges` are the same model arrays the text renderer reads (`model.concepts`,
        // `model.moduleGraph.edges` — not previously surfaced as data at all, `nodes` above carries layer
        // placement only); `changes` is the FULL `model.changeArchetypes` list, uncapped — the text line's own
        // top-4 slice is a display concern, and nothing else in `--json` exposes the rest of this array either.
        concepts: model.concepts || [],
        changes: (model.changeArchetypes || []).map(a => ({ id: a.id, label: a.label, n: a.n })),
        edges: (model.moduleGraph?.edges || []).map(e => ({ from: e.from, to: e.to, n: e.n })),
        // §073: the FULL birth-obligation table, uncapped — same additive-only discipline as `changes`/`concepts`
        // above; `grain obligation <path>` is the per-path renderer of this exact data (`model.obligations`).
        obligations: model.obligations || [],
        decisions:
          (model.steers || []).length + (model.boundaries || []).length + (model.waivers || []).length,
        asOf: stamp().replace(/^as of /, ''),
      }),
    ];
  return [...mapSections(model), ...(treeDirty ? [DIRTY_TREE_NOTE] : []), stamp()];
}
// `grain obligation <path>` (ticket 073) — what a NEW file under this path's (module, suffix) class has
// historically come with. `<path>` need not exist: the whole point is asking BEFORE the file is written, so this
// never touches the filesystem or git — it is a pure read of `model.obligations` (learn-time derived) keyed by
// the path's structural class alone. `schemaNotes` follows export.mjs's own convention (§export.mjs:~210) for a
// JSON surface whose field meanings are not self-evident from their names.
export async function cmdObligation({ model, root, args, opts, stamp }) {
  if (!args[0] || args.length > 1) throw new Error('usage: grain obligation <path> [--top N] [--json]');
  const rel = relPath(root, args[0]);
  const top = +opts.top || 5;
  const data = obligationFor(model, rel);
  if (opts.json)
    return [
      JSON.stringify({
        schema: 'grain-obligation/1',
        path: rel,
        module: data.module,
        suffix: data.suffix,
        births: data.n,
        rules: data.rules.slice(0, top),
        ambient: data.ambient.slice(0, top),
        schemaNotes: {
          births:
            'how many recorded commits ever ADDED a file in this (module, suffix) class — never a rename, only a genuine new file. 0 means the class has no history at all; a non-zero `births` with empty `rules`/`ambient` means the class exists but sits below the certification floor (CFG.minRaw = 5) or nothing certified — both are real, disclosed outcomes, never a hollow zero.',
          rules:
            'specific obligations: files whose co-occurrence with this class beats their OWN base rate over the whole history by the same KT/BIC codelength contrast + λ=8 display bound + CFG.minRaw support floor every other certified convention in this model uses. `k` of `n` = of the `n` births in this class, how many also touched `file`.',
          ambient:
            "files that touch almost every commit REGARDLESS of class (their own global rate already clears the same λ bound) — reported separately so they never crowd out a specific obligation (§obligations-design.md §2). `k` of `n` here is the file's OWN global touch count over the whole history, not a class-conditional count.",
        },
        asOf: stamp().replace(/^as of /, ''),
      }),
    ];
  return [...obligationLines(model, rel, { top }), stamp()];
}
