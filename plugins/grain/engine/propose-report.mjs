// grain engine · proposal writer · what `grain propose` prints, and what --json writes
// Split out of propose.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { pct } from './propose-base.mjs';
import { TYPE_LEVELS } from './propose-levels.mjs';

// ==================================================================================================
// 11. The report — what `grain propose` prints, and what `--json` writes.
//
// ONE builder for both surfaces (ticket 104). The text lines and the JSON document are produced from the same
// pass over the same objects, so a fact cannot appear in one and not the other; `tests/cross-check-propose.
// test.mjs` pins that.
//
// THE DEFAULT REPORT IS QUIET (ruling `propose-default-is-quiet`). On Yggdrasil's own proposal 124 aspects are
// drafted and 10 of them earned enforcement — a report in which 92% of the rows are things nobody should act on
// discourages the adopter and undermines the 8% that is true. So the default carries exactly three things, and
// every line of it carries a number or a path:
//
//   1. THE ARCHITECTURE — node types, nodes, relations, dependency cycles. This is the part that loads.
//   2. WHAT EARNED ENFORCEMENT — aspects a REAL `yg drill` promoted to `status: enforced`, each with what it
//      checks and the drill's own numbers (caught / false alarms / corpus size) beside the practice it was
//      mined from (share, n). Ticket 107, ruling `enforced-requires-certified-origin`: earning this section
//      needs the drill AND a `certified-convention` origin — a rule grain's own certification bound cleared.
//      A `sub-gate-lattice` origin that clears the identical drill is real, but not yet law; it lands in (3).
//   3. THE CANDIDATES — first the ADVISORY aspects (ticket 107): a sub-gate-lattice row a real drill proved
//      correct (0 false alarms, >= 1 caught) but that grain itself declined to certify — `sub-gate-rows-are-
//      the-product` calls this a refactor plan, not a rule to switch on unread. Then, folded into the SAME
//      list below them, today's older definition: a DRAFT (any origin, but in practice a false-alarming
//      certified convention) the same real drill still caught at least one violation with — the exact bar
//      `no-catch-rules-stay-draft` sets for a rule to be doing anything at all. Either way a maintainer can
//      act on the line immediately; each one names its origin's yg status word so turning it on reads as the
//      refactor decision it is. It follows that with no drill there are no candidates to rank — which the
//      report says, rather than ranking drafts nobody has judged. No display cap is applied and none is
//      needed: the definition does the cutting.
//
// Everything else — prose drafts, no-catch drafts, finer type alternatives, the conventions skipped as not a
// rule — is written to disk exactly as before and summarised here in ONE counted line naming the file that
// holds it. `--full` prints it all.
export function proposeReport(r, { outDir, root, full = false } = {}) {
  const rel = p => (root && p.startsWith(root + '/') ? p.slice(root.length + 1) : p);
  const out = rel(outDir);
  const ygg = `${out}/.yggdrasil`;
  const c = r.counts;
  const sha = (r.exp?.asOf || '').slice(0, 7);
  const edges = r.nodes.reduce((a, n) => a + n.relations.length, 0);
  // The report says how far a rule already holds in the same words the rule's own file says it (§7-bis), so
  // a maintainer reading the report and then opening the aspect meets one sentence, not two.
  const evidenceOf = a => a.holds || `${a.share == null ? 'share n/a' : pct(a.share)} of ${a.n ?? 0} site(s), ${a.deviating ?? 0} deviating`;
  const aspectPath = a => `${ygg}/aspects/${a.id}/`;
  const caught = a => (a.drill ? a.drill.catches : 0);
  const byStrength = (a, b) => caught(b) - caught(a) || (b.share ?? 0) - (a.share ?? 0) || (b.n ?? 0) - (a.n ?? 0);

  const enforced = r.aspects.filter(a => a.finalStatus === 'enforced').sort(byStrength);
  // candidates (ticket 107): advisory aspects first (sub-gate origin, same drill bar as enforced — a refactor
  // decision, not law), then the older definition folded in below them — a DRAFT the same real drill still
  // caught at least one violation with. Both groups sort strongest-evidence-first WITHIN themselves; advisory
  // sits above legacy because it cleared a strictly higher bar (0 false alarms, not merely >=1 catch).
  const advisory = r.aspects.filter(a => a.finalStatus === 'advisory').sort(byStrength);
  const legacyCandidates = r.aspects.filter(a => a.finalStatus === 'draft' && caught(a) > 0).sort(byStrength);
  const candidates = [...advisory, ...legacyCandidates];
  const rest = r.aspects.filter(a => a.finalStatus === 'draft' && caught(a) <= 0);
  // counted over `rest` alone, not over every draft: a candidate above is also a draft, and a summary line that
  // re-counted it would make the report's own numbers add up to more than the aspects that exist
  const restByReason = {};
  for (const a of rest) { const k = a.draftReason || 'unverified'; restByReason[k] = (restByReason[k] || 0) + 1; }

  // What an enforced rule costs on the day the graph is switched on (ticket 118). `deviating` is the count of
  // sites that break the rule at `asOf`; whether they block depends on the progressive reference the proposal
  // just wrote, so the sentence names the one that applies rather than leaving the reader to work it out.
  const prog = r.progressive || { reference: null, why: null };
  const existingCost = a => {
    const n = a.deviating ?? 0;
    if (!n) return ' · nothing in this repository breaks it today';
    return prog.reference
      ? (n === 1
        ? ' · 1 existing site violates it today; progressive mode keeps it a warning until touched'
        : ` · ${n} existing sites violate it today; progressive mode keeps them as warnings until touched`)
      : ` · the first \`yg check\` will be red on ${n} site${n === 1 ? '' : 's'} that break${n === 1 ? 's' : ''} it today`;
  };

  const aspectJson = a => ({
    id: a.id, statement: a.name, status: a.finalStatus,
    draftReason: a.draftReason || null, reviewer: a.check ? 'deterministic' : 'llm',
    share: a.share ?? null, n: a.n ?? null, deviating: a.deviating ?? null, existingViolations: a.deviating ?? null, node: a.host || null,
    drill: a.drill ? { caught: a.drill.catches, planted: a.drill.violates, falseAlarms: a.drill.falseAlarm } : null,
    path: aspectPath(a),
  });

  const json = {
    schema: 'grain-propose/1',
    outDir: out, repo: root || null, asOf: r.exp?.asOf || null, files: r.files.length, degraded: r.degraded || null,
    // `levels`/`alternativeLevels` (ticket 110, additive): which level each active type was cut at, and which
    // level each candidate the run did not activate was offered at. Both keyed by level name, summing to
    // `nodeTypes` and to `alternatives`.
    architecture: { nodeTypes: c.types, levels: c.typesByLevel || {}, alternativeLevels: c.alternativesByLevel || {}, nodes: c.nodes, relations: edges, cycles: c.nodeCycles, path: `${ygg}/yg-architecture.yaml` },
    // `timedOut` (additive) counts drills abandoned at `DRILL_TIMEOUT_MS`; their aspects are unverified, so
    // they are already inside the draft counts below — this names WHY they are, rather than leaving it silent.
    yggdrasil: { found: !!r.verify?.haveYg, cli: r.verify?.haveYg ? r.verify.ygBin : null, drilled: r.verify?.verified || 0, timedOut: r.verify?.timedOut || 0 },
    // `progressive` (ticket 118, additive) — the reference the proposal's own `yg-config.yaml` names, and why
    // that one. `reference: null` means the block was left out and the first `yg check` answers for everything.
    progressive: { reference: prog.reference || null, why: prog.why || null },
    // `advisory` (ticket 107, additive) is also the count of `candidates` rows that carry `status: advisory` —
    // both numbers are given so a reader does not have to filter `candidates` to get the split.
    aspects: { total: c.aspects, enforced: enforced.length, advisory: advisory.length, candidates: candidates.length, rest: rest.length, restByDraftReason: restByReason },
    enforced: enforced.map(aspectJson),
    candidates: candidates.map(aspectJson),
    alternatives: c.alternatives,
    skippedNotARule: c.aspectsSkippedNotARule,
    // ticket 120, additive: WHY (`parser-node-type-as-identifier` | `generic-type-parameter-as-domain-type` |
    // absent for the pre-existing `filebirth` case), and the two other identifier-hygiene disclosures — a
    // narrower-than-scope cluster that stayed draft, and a proposed type with no aspect and no relation.
    skippedNotARuleByReason: c.aspectsSkippedNotARuleByReason || {},
    skippedUnrenderableGroupScoped: c.aspectsSkippedUnrenderableGroupScoped,
    clusterNarrowerThanScope: c.aspectsClusterNarrowerThanScope || 0,
    typesWithNoLaw: c.typesWithNoLaw || 0,
    paths: { proposal: `${out}/PROPOSAL.md`, evidence: `${out}/proposal.json`, backlog: `${out}/REFACTOR-BACKLOG.md`, alternatives: `${out}/alternatives.md`, sizing: `${out}/sizing.json`, graph: `${ygg}/` },
    ...(full ? { restAspects: rest.map(aspectJson) } : {}),
  };

  const L = [];
  L.push(`proposed a graph for ${r.files.length} tracked files, as of ${sha} — ${ygg}/`);
  // Only when it happened, and above everything else: every count below is measured over that weaker set.
  if (r.degraded) L.push(`  WARNING: ${r.degraded}`);
  // The types line names the LEVEL each cut came from (ticket 110): no single level wins across repositories,
  // so the report says which levels this repository's cut is made of, and how many candidates at other levels
  // are on offer instead — the number that tells a maintainer whether there is a choice left to make.
  const levelsPhrase = TYPE_LEVELS.filter(l => c.typesByLevel?.[l]).map(l => `${c.typesByLevel[l]} ${l}`).join(', ');
  L.push(`architecture: ${c.types} node types${levelsPhrase ? ` (${levelsPhrase})` : ''} · ${c.nodes} nodes · ${edges ? `${edges} relations` : `no law about dependencies could be mined (${r.exp?.relStages?.seen ?? 0} references seen, ${r.exp?.relStages?.resolved ?? 0} resolved, ${r.exp?.relStages?.crossing ?? 0} survived the module cut)`} · ${c.nodeCycles} dependency cycle(s) — ${ygg}/yg-architecture.yaml`);
  if (!r.verify?.haveYg) {
    L.push(`enforced: 0 of ${c.aspects} aspects — no Yggdrasil CLI was found, so no rule was drilled and NOTHING here is enforced (set YG_BIN to a built bin.js, or put \`yg\` on PATH, then run this again)`);
    L.push(`candidates: 0 of ${c.aspects} — a candidate is an advisory or draft aspect a real drill caught a violation with, and no drill ran`);
  } else {
    L.push(`enforced: ${enforced.length} of ${c.aspects} aspects earned \`status: enforced\` from a real drill of ${r.verify.verified} deterministic check(s) — a certified-convention origin required, not just a passing drill (${r.verify.ygBin})`);
    // A line only when it happened: a drill that never returned would otherwise leave its aspect in the draft
    // pile with no reason given, which reads as "the check is bad" rather than "nothing judged it".
    if (r.verify.timedOut) L.push(`  ${r.verify.timedOut} drill(s) were given up on after ${r.verify.drillTimeoutMs / 1000}s each and their aspects are unverified, not judged — re-run, or drill them by hand with \`yg drill --aspect <id>\``);
    for (const a of enforced) {
      L.push(`  ${a.id} — ${a.name}`);
      L.push(`    caught ${a.drill.catches} of ${a.drill.violates} planted violation(s) · ${a.drill.falseAlarm} false alarm(s) · it already ${evidenceOf(a)}${existingCost(a)} — ${aspectPath(a)}`);
    }
    // Said once, under the enforced list, because it is the same answer for all of them (ticket 118). The
    // drill proved each check correct; it never asked whether this repository already holds the rule.
    if (enforced.length) {
      L.push(prog.reference
        ? `  measured against \`${prog.reference}\` — ${prog.why}: the sites above that break a rule today are reported as warnings until a change reaches them, and \`yg check --full\` blocks on all of them. Remove \`progressive\` from ${ygg}/yg-config.yaml to answer for the whole repository on every run.`
        : `  no branch to measure against: ${prog.why}, so the proposal names none and the first \`yg check\` blocks on every site above. Set \`progressive: { reference: <branch> }\` in ${ygg}/yg-config.yaml to hold the pre-existing sites as warnings until a change reaches them.`);
    }
    L.push(`candidates: ${candidates.length} of ${c.aspects} — ${advisory.length} advisory (sub-gate origin, same drill bar as enforced but below grain's own certification bound) + ${legacyCandidates.length} draft(s) a drill still caught a violation with, strongest evidence first within each`);
    for (const a of candidates) {
      L.push(`  ${a.id} — ${a.name}`);
      L.push(`    caught ${a.drill.catches} of ${a.drill.violates} · ${a.drill.falseAlarm} false alarm(s) · it already ${evidenceOf(a)} · yg status \`${a.finalStatus}\`${a.finalStatus === 'draft' ? ` (${a.draftReason || 'unverified'})` : ''} — ${aspectPath(a)}`);
    }
  }
  const byReason = Object.entries(restByReason).sort().map(([k, v]) => `${v} ${k}`).join(', ') || 'none';
  // ticket 120, additive: the "skipped as not a rule" count now names WHY, whenever a reason is known — the
  // pre-existing `filebirth` case (no reason recorded) still folds into the bare number so the total agrees.
  const notARuleByReason = c.aspectsSkippedNotARuleByReason || {};
  const notARulePhrase = Object.keys(notARuleByReason).length
    ? `${c.aspectsSkippedNotARule} convention(s) skipped as not a rule (${Object.entries(notARuleByReason).sort().map(([k, v]) => `${v} ${k}`).join(', ')})`
    : `${c.aspectsSkippedNotARule} convention(s) skipped as not a rule`;
  L.push(`on disk, not above: ${rest.length} more draft(s) (${byReason}) · ${c.alternatives} finer type alternative(s) · ${notARulePhrase} · ${c.typesWithNoLaw || 0} type(s) with no law attached (no aspect, no relation) — ${out}/PROPOSAL.md`);
  if (full) {
    L.push(`== the remaining ${rest.length} draft(s), by why each is one ==`);
    for (const reason of [...new Set(rest.map(a => a.draftReason || 'unverified'))].sort()) {
      const group = rest.filter(a => (a.draftReason || 'unverified') === reason);
      L.push(`  ${reason}: ${group.length}`);
      for (const a of group) L.push(`    ${a.id} — ${a.name} · it already ${evidenceOf(a)} — ${aspectPath(a)}`);
    }
    const altLevels = TYPE_LEVELS.filter(l => c.alternativesByLevel?.[l]).map(l => `${c.alternativesByLevel[l]} ${l}`).join(', ');
    L.push(`== ${c.alternatives} finer type alternative(s), not cut as types${altLevels ? ` (${altLevels})` : ''} — ${out}/alternatives.md ==`);
    for (const alt of r.alternatives) L.push(`  ${alt.id} [${alt.level}] — ${alt.why}`);
  }
  L.push(`next: read ${out}/PROPOSAL.md (per-element evidence: ${out}/proposal.json), then move ${ygg}/ to the repository root as .yggdrasil/ and run \`yg check\``);
  return { lines: L, json };
}
