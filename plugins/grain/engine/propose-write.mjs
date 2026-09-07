// grain engine · proposal writer · the render pipeline: read the model, write the staging tree
// Split out of propose.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readGraph, intersectSize } from './yggdrasil-graph.mjs';
import { ENGINE_VERSION, EXTR_V } from './config.mjs';
import { buildAspects } from './propose-aspects.mjs';
import {
  BIN,
  SCHEMA_VERSION,
  gitFiles,
  preambleComment,
  progressiveReference,
  say,
  slug,
  uniq,
  write,
  yamlEmit,
} from './propose-base.mjs';
import { effectiveAspectsForNode, renderNodeCharter } from './propose-charters.mjs';
import { cutDrills } from './propose-drills.mjs';
import { nodeCochangePairs } from './propose-family.mjs';
import { partitionLattice, subGate } from './propose-lattice.mjs';
import { countBy, levelSentence, localities } from './propose-levels.mjs';
import { renderAlternativesMd, renderBacklogMd, renderProposalMd } from './propose-markdown.mjs';
import { buildNodes, buildRelations, nestedProjectRoots } from './propose-nodes.mjs';
import { computeSizing } from './propose-sizing.mjs';
import { aspectYamlDoc, promoteEnforceableAspects } from './propose-status.mjs';
import { buildTypes } from './propose-types.mjs';

// The inputs: the tracked files, the export (reused when the caller already has one, spawned otherwise), the
// model cache when there is one, and the predicate-expansion context every `when` is measured against.
function loadInputs(repo, opts) {
  const { files, degraded } = gitFiles(repo);
  let exp;
  if (opts.exportPath) exp = JSON.parse(readFileSync(opts.exportPath, 'utf8'));
  else {
    say(opts, 'running grain export ...');
    // UNDER `cache/`, WHICH IS THE DISPOSABLE HALF. `.grain/.gitignore` ignores `cache/` and nothing else —
    // "everything else in .grain/ is meant to be committed" — so an export written to `.grain/` directly left a
    // multi-megabyte generated file sitting in the committable half of a repository this module promises to
    // treat as read-only, never cleaned up and showing as an untracked change in any repo that already commits
    // its `.grain/`. It is rebuildable state, so it belongs where the rest of the rebuildable state is.
    const out = join(repo, '.grain', 'cache', 'propose-export.json');
    const args = ['export', '--repo', repo, '--out', out, '--compact', '--no-anchors'];
    if (opts.noHistory) args.push('--no-history');
    execFileSync('node', [BIN, ...args], { encoding: 'utf8', maxBuffer: 1 << 29, timeout: 120 * 60_000, stdio: ['ignore', 'pipe', opts.quiet ? 'ignore' : 'inherit'] });
    exp = JSON.parse(readFileSync(out, 'utf8'));
  }
  const cachePath = join(repo, '.grain', 'cache', 'model.json');
  const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : null;
  const ctx = { root: repo, pathCache: new Map(), contentCache: new Map(), headCache: new Map(), unknownWhenKeys: new Set(), parsed: new Set(cache?.filesAll || []) };
  return { files, exp, cache, ctx, degraded };
}
// `yg-config.yaml` and `yg-architecture.yaml`: what a repository requires (nothing) and the node types.
function writeArchitecture(ygg, { active, alternatives, nodes, rels, files, ev, progressive }) {
  // yg-config.yaml — require nothing. A proposal that turns every unmapped file into a blocking error on day one
  // is a proposal nobody runs twice; `getting-started` §4 says require-nothing is the brownfield default.
  //
  // `progressive` (ticket 118) is the same principle applied to the RULES rather than to coverage: an enforced
  // rule earned its status from a drill that never asked whether the repository already holds it, so on day one
  // it blocks on code nobody in this change wrote. With the block set, `yg check` blocks only on what the
  // current change reaches; the pre-existing sites are still listed and still counted, as warnings, and
  // `yg check --full` blocks on all of them again. It is left out entirely where the repository gave nothing to
  // derive — a block that names no reference is refused by Yggdrasil rather than silently ignored.
  write(join(ygg, 'yg-config.yaml'), preambleComment() + yamlEmit({
    version: SCHEMA_VERSION,
    coverage: { required: [], excluded: [] },
    auto_approve: false,
    quality: { max_direct_relations: Math.max(10, ...nodes.map(n => n.relations.length)) },
    ...(progressive?.reference ? {
      '#e': `progressive: measure a change against \`${progressive.reference}\` — ${progressive.why}. An enforced rule this change did not reach is reported as a warning instead of blocking; \`yg check --full\` blocks on all of it again. Remove this block to answer for the whole repository on every run.`,
      progressive: { reference: progressive.reference },
    } : {}),
  }));

  // yg-architecture.yaml
  const nodeTypes = {
    project: { '#e': ev('type', 'project', 'organizational root; no `when`, classifies nothing', { level: 'organizational' }), description: 'Top-level grouping — root of the hierarchy. One per repository.', parents: [] },
    // `module` is the organizational grouping the renderer inserts wherever a directory has to exist as a node
    // but owns no files of its own. Such a node is routinely a CHILD of a classifying type's node (a `module`
    // named `src/main` under the node for the `src` type), so every active type is an allowed parent — derived
    // from the cut this run actually made, not chosen. Measured (ticket 101): without this, a staged `yg check`
    // on spring-petclinic reported `parent-type-forbidden` — "Node 'src/main' (type 'module') has parent 'src'
    // of type 'src', which is not an allowed parent type" — a blocking error in the proposal's own graph.
    module: { '#e': ev('type', 'module', 'organizational grouping; no `when`, classifies nothing', { level: 'organizational' }), description: 'Domain grouping — organizes children under shared domain responsibility.', parents: ['project', 'module', ...active.map(a => a.id)] },
  };
  for (const a of active) {
    const targets = uniq([...(rels.uses.get(a.id) || new Map()).keys()]).sort();
    const deny = rels.denies.find(d => d.fromType === a.id);
    // WHAT THE PREDICATE ACTUALLY SELECTS, said as a match and a miss rather than as a coefficient (ticket
    // 109). The same three numbers as before — selected, overlap, total — plus the Jaccard the earlier line
    // led with, kept at the tail and named, because `J=0.62` is not a fact a maintainer can act on and
    // "selects 31 files, 12 of which the evidence never named" is.
    const hit = intersectSize(a.files, a.selected);
    const line = `\`${a.rootGlob ? '*' : `${a.dir}/**`}\` selects ${a.selected.size} of ${files.length} tracked files; ${hit === a.files.size && hit === a.selected.size ? `exactly the ${hit} the evidence names` : `${hit} of them are among the ${a.files.size} the evidence names, ${a.selected.size - hit} are not`} (Jaccard ${a.fidelity.toFixed(2)}) · ${a.why}`
      // the LEVEL this cut came from and the intrinsic numbers behind it (ticket 110), appended to the line
      // 109 already wrote rather than replacing it: the two answer different questions about the same type.
      + (levelSentence(a, alternatives) ? ` · ${levelSentence(a, alternatives)}` : '');
    const relBlock = {};
    if (targets.length) relBlock.uses = targets;
    if (deny) relBlock.default = 'deny';
    // A TYPE IS A CLASSIFIER, AND ITS `relations:` ARE THE ONE OBLIGATION IT CARRIES. Yggdrasil constrains a
    // relation type the moment a list is given for it ("the validator then rejects any target not in that
    // list" — `yg knowledge read ports-and-relations`), and refuses a node that depends on a node it has not
    // declared a relation to (`relation-undeclared-dependency`, always an error). So where this renderer
    // writes a `uses:` list, the description says what the list MEANS for an agent about to add an import,
    // instead of naming the miner's cut it came from.
    const mayUse = targets.length
      ? ` Code of this type may depend on ${targets.map(t => `\`${t}\``).join(', ')}${deny ? ' and on nothing else' : ''} — \`yg check\` refuses a dependency on any other node until the architecture declares it.`
      : deny ? ' This type declares no outgoing dependency, and none is allowed — `yg check` refuses the first one until the architecture declares it.' : '';
    nodeTypes[a.id] = {
      '#e': ev('type', a.id, line, { level: a.source, levels: a.levels || [a.source], dir: a.dir, evidenceFiles: a.files.size, selects: a.selected.size, fidelity: +a.fidelity.toFixed(3), intrinsic: a.evidence || null }),
      description: `${a.dir ? `Put a file under \`${a.dir}/\`` : 'Put a file at the repository root itself'} only if it belongs to this type: a file placed there is classified here with no further step, and every rule attached to this type applies to it from that moment.${mayUse || (a.aspectIds?.length ? '' : ' No rule and no relation are attached to this type yet, so today it constrains nothing — it is where they will attach.')}`,
      when: a.when,
      // a nested type's node sits under its ancestors' nodes, and Yggdrasil rejects a parent whose type is not
      // listed here (`parent-type-forbidden`) — so every ancestor type is an allowed parent, by construction
      parents: ['project', 'module', ...active.filter(b => b.dir && a.dir && b.dir !== a.dir && a.dir.startsWith(b.dir + '/')).map(b => b.id)],
      ...(Object.keys(relBlock).length ? { relations: relBlock } : {}),
      // Bare ids, deliberately — no explicit `status:` override at this attach site (channel 3). This block is
      // written before an aspect's OWN final status is known (verification runs later, once check.mjs and its
      // drill corpus are on disk), and an explicit override here would need to track it exactly: any override
      // LOWER than the aspect's own eventual default is `aspect-status-downgrade`, a validator error (`yg
      // schemas read architecture` — "bump up OK, downgrade is validator error"). Found on sight rendering
      // Yggdrasil's own proposal once `promoteEnforceableAspects` started promoting some aspects to `enforced`:
      // the old `{ id, status: 'draft' }` form downgraded every one of them right back down, twelve nodes'
      // worth. Omitting `status:` here lets the cascade rule (effective status = max() across channels 1–6)
      // read the aspect's own default with nothing to disagree with, whatever that default turns out to be.
      ...(a.aspectIds?.length ? { aspects: [...a.aspectIds] } : {}),
    };
    if (targets.length) ev('relations', a.id, `${targets.length} allowed \`uses\` targets, aggregated from ${[...(rels.uses.get(a.id) || new Map()).values()].reduce((x, y) => x + y, 0)} resolved imports out of files of this type`);
    if (deny) ev('deny', a.id, `established negative: \`${deny.from}\` does not reach \`${deny.to}\` (share ${deny.share.toFixed(3)}, ${deny.ne}/${deny.neff} scopes, ${deny.bits.toFixed(1)} bits) AND this type has no resolved outgoing import at all, so the deny contradicts nothing observed`);
  }
  write(join(ygg, 'yg-architecture.yaml'), preambleComment() + yamlEmit({ node_types: nodeTypes }));
}
// `model/<node>/yg-node.yaml`: one per node, mapping and relations.
function writeNodeFiles(ygg, nodes, ev) {
  for (const n of nodes) {
    const relEntries = n.relations.map(r => ({ target: r.target, type: 'uses' }));
    const line = n.organizational ? n.why : `${n.why}; maps ${n.files.size} tracked files; ${n.relations.length} outgoing dependencies from ${n.relations.reduce((a, r) => a + r.n, 0)} resolved imports`;
    ev('node', n.id, line, { files: n.files.size, relations: n.relations.length, organizational: !!n.organizational });
    write(join(ygg, 'model', n.id, 'yg-node.yaml'), preambleComment() + yamlEmit({
      '#e': line,
      name: n.id,
      type: n.type,
      description: n.organizational ? `Parent node for \`${n.id}\` — children own the mappings.` : `Proposed node for \`${n.dir}\`.`,
      // A directory mapping wherever the whole directory is live: Yggdrasil's child precedence then hands each
      // file to the deepest node that claims it, and no file is owned twice. Where a nested project (its own
      // `.yggdrasil/`) removes part of the directory the mapping has to be an explicit list — and an explicit
      // list gets NO child precedence, so every descendant node's files are subtracted here by hand. Measured:
      // without that subtraction the pattern repo produced 591 `file-duplicate-mapping` errors from two nodes.
      ...(n.organizational ? {} : { mapping: n.useDir ? [`${n.dir}/`] : [...n.ownFiles].sort() }),
      relations: relEntries,
    }));
  }
}
// aspects/<id>/ — yg-aspect.yaml, the rule source (check.mjs or content.md), and a drill corpus.
//
// `status` is written TWICE. Every aspect ships `draft` here, first — `yg drill` is not gated by status
// (`yg knowledge read aspect-status`: "draft dormancy applies to `yg check`/`--approve` only"), so `draft` is
// the one value guaranteed valid before this renderer knows a check's own verdict. `promoteEnforceableAspects`
// below rewrites `yg-aspect.yaml` a second time for whatever a REAL drill just confirmed — see the header.
function writeAspectFiles(ygg, repo, aspects, opts, ev) {
  let drillCases = 0, drillDropped = 0;
  for (const a of aspects) {
    ev('aspect', a.id, a.evidenceLine, { reviewer: a.check ? 'deterministic' : 'llm', origin: a.origin, enumerator: a.enumerator, identifier: a.argument ?? null, expected: a.expected ?? null, host: a.host });
    write(join(ygg, 'aspects', a.id, 'yg-aspect.yaml'), preambleComment() + yamlEmit(aspectYamlDoc(a, 'draft')));
    if (a.check) write(join(ygg, 'aspects', a.id, 'check.mjs'), a.check);
    else write(join(ygg, 'aspects', a.id, 'content.md'), a.content);

    const { kept, dropped } = cutDrills(repo, a, opts.holdout);
    // On-disk case counts, not `a.drills`' full deviating/conforming lists (`cutDrills` caps each side at 5) —
    // `promoteEnforceableAspects` below judges the check by what a real drill can actually see.
    a.drillViolatesWritten = kept.violates.length;
    a.drillSatisfiesWritten = kept.satisfies.length;
    const lines = [];
    for (const side of ['satisfies', 'violates']) {
      for (const c of kept[side]) {
        const label = `${side}-${slug(c.rel.replace(/\.[^./]+$/, ''))}`.slice(0, 90);
        write(join(ygg, 'aspects', a.id, 'drills', label, c.rel), c.content);
        lines.push(`- \`${label}/${c.rel}\` — from \`${c.rel}\`${c.name ? ` (\`${c.name}\`)` : ''}${c.born ? `, first seen ${c.born}` : ''}`);
        drillCases++;
      }
      drillDropped += dropped[side];
    }
    if (lines.length) write(join(ygg, 'aspects', a.id, 'drills', 'CORPUS.md'), [
      `# Drill corpus for \`${a.id}\``, '',
      opts.holdout
        ? `**Hold-out: BY TIME, cut at ${opts.holdout}.** Only sites whose first appearance post-dates that date are here; ${dropped.satisfies + dropped.violates} older sites were dropped. The hold-out is by the export's per-site \`lifecycle.firstSeen\` DATE, not by a cut sha — ticket 097 does the sha version and scores it with \`yg drill\`/\`yg simulate\`.`
        : '**Hold-out: NONE.** These cases are cut from the very sites the rule was mined on, so passing this drill proves only that the rendered check reproduces grain\'s own count — it is NOT evidence the rule generalises. Re-cut with `--holdout <YYYY-MM-DD>`; ticket 097 does the held-out version by cut sha.',
      '', `Provenance: ${a.provenance}`, '', ...lines, '',
      'Layout is Yggdrasil\'s: each source file under a `satisfies-*` / `violates-*` directory is one case;',
      'a `violates-*` case MUST be refused and a `satisfies-*` case MUST pass. Score with:', '',
      '```', `yg drill --aspect ${a.id} --dir .yggdrasil/aspects/${a.id}/drills --corpus grain-proposal`, '```', '',
    ].join('\n'));
  }
  return { drillCases, drillDropped };
}
// charter.md — one per proposed node, beside its yg-node.yaml (ticket 100, §7c above). Written here, AFTER
// sizing.json, so every charter can quote its own node's sizing row instead of recomputing it.
function writeCharters(ygg, { nodes, aspects, sizing, exp, nodeOfFile, repo, ev }) {
  const sizingByNode = new Map((sizing.proposedNodes || []).map(s => [s.id, s]));
  const cochangeByNode = nodeCochangePairs(exp, nodeOfFile);
  let chartersWritten = 0, charterLines = 0;
  for (const n of nodes) {
    const md = renderNodeCharter(n, { nodes, aspects, sizingByNode, cochangeByNode, asOf: exp.asOf, repo });
    write(join(ygg, 'model', n.id, 'charter.md'), md);
    // The audit row counts what the charter NAMES, through the same cascade the charter renders (ticket 114).
    // It used to compare an aspect's `host` — a TYPE id — against the node's `id`, a PATH: the category error
    // ticket 112 fixed inside the charter, left behind in the row that reports on it, so every charter row on
    // every repository read "0 hosted aspect drafts" including the ones whose charter names eight.
    const eff = effectiveAspectsForNode(n, nodes, aspects);
    ev('charter', n.id, `charter.md rendered for \`${n.id}\` — ${n.organizational ? 'organizational node' : `${n.files.size} files`}, ${eff.own.length + eff.inherited.length} rules in force here (${eff.own.length} attached at this node's own type, ${eff.inherited.length} inherited from an ancestor), ${(cochangeByNode.get(n.id) || []).length} co-change partners`);
    chartersWritten++; charterLines += md.split('\n').length;
  }
  return { chartersWritten, charterLines };
}
export async function propose(repo, outDir, opts = {}) {
  const { files, exp, cache, ctx, degraded } = loadInputs(repo, opts);
  if (degraded) say(opts, `WARNING: ${degraded}`);

  say(opts, `${repo}: ${files.length} tracked files · ${(exp.partitions || []).length} partitions · ${(exp.conventions || []).length} conventions`);
  const loc = localities(exp, cache, files);
  const { active, alternatives } = buildTypes(exp, loc, files, ctx);
  // deepest wins, matching Yggdrasil's own child precedence (a child node claiming a file inside a directory
  // its parent globs owns that file)
  const byDepth = [...active].sort((a, b) => (a.dir || '').split('/').length - (b.dir || '').split('/').length);
  const typeOfFile = new Map();
  for (const a of byDepth) for (const f of a.files) typeOfFile.set(f, a.id);
  const rels = buildRelations(exp, typeOfFile, active);
  const nestedRoots = nestedProjectRoots(files);
  const { nodes, cycles: nodeCycles, nodeOfFile } = buildNodes(active, exp, nestedRoots);
  say(opts, `types: ${active.length} active · ${alternatives.length} finer alternatives · nodes: ${nodes.length} · ${nodeCycles.length} dependency cycles in the proposed node graph (declared, not hidden — the proposal is red until they are broken)`);

  const lat = await partitionLattice(repo);
  const sub = subGate(lat.rows);
  say(opts, `lattice: ${lat.rows.length} rows${lat.reason ? ` (${lat.reason})` : ''} · ${sub.length} in the sub-gate band`);

  const { aspects, skipped } = buildAspects(exp, active, sub, opts);
  say(opts, `aspect drafts: ${aspects.length} (${aspects.filter(a => a.check).length} rendered as check.mjs, ${aspects.filter(a => !a.check).length} prose) · skipped: ${skipped.unrenderableGroupScoped} unrenderable group-scoped, ${skipped.notARule} not a rule`);

  // ---------------- write ----------------
  const ygg = join(outDir, '.yggdrasil');
  rmSync(ygg, { recursive: true, force: true });
  mkdirSync(ygg, { recursive: true });
  const evidence = [];
  const ev = (kind, id, line, extra = {}) => { evidence.push({ kind, id, evidence: line, ...extra }); return line; };

  // The branch a change is measured against, derived from this repository (ticket 118) — read once here so the
  // config, the report and `--json` all name the same reference and cannot disagree about it.
  const progressive = progressiveReference(repo);
  writeArchitecture(ygg, { active, alternatives, nodes, rels, files, ev, progressive });

  // EVERY CANDIDATE THIS RUN DID NOT ACTIVATE, IN THE AUDIT TRAIL (ticket 110). The active types have carried an
  // `evidence` row since 094; the alternatives were on disk in `alternatives.md` and nowhere in the machine
  // record, so nothing downstream could compare a cut that was made against a cut that was offered. Each row
  // carries the level, the form of the predicate, the type it would be carved out of, and the SAME intrinsic
  // numbers the active types carry.
  for (const alt of alternatives) {
    ev('alternative', alt.id, `${alt.why}${levelSentence({ ...alt, levels: [alt.level] }, []) ? ` · ${levelSentence({ ...alt, levels: [alt.level] }, [])}` : ''}`,
      { level: alt.level, form: alt.form, of: alt.of, selects: alt.selected, fidelity: alt.fidelity, viable: alt.viable, intrinsic: alt.evidence || null });
  }

  writeNodeFiles(ygg, nodes, ev);

  const { drillCases, drillDropped } = writeAspectFiles(ygg, repo, aspects, opts, ev);
  say(opts, `drills: ${drillCases} cases${opts.holdout ? ` (hold-out ${opts.holdout}; ${drillDropped} sites dropped as pre-cut)` : ' (NO hold-out — labelled as such in every CORPUS.md)'}`);

  // Aspect status, earned or not — rulings `prose-aspects-draft-by-default`, `drill-fa-labelling-is-acceptance-
  // not-defect`, `no-catch-rules-stay-draft` (ticket 101/102). Rewrites `yg-aspect.yaml` for whatever a real
  // drill just confirmed, writes every `provenance.json` (deferred until now so it can carry the verdict), and
  // annotates the matching `evidence[]` rows in place. See the header comment for the full rule.
  const verify = promoteEnforceableAspects(aspects, { ygg, outDir, evidence, asOf: exp.asOf, repo, ygBin: opts.ygBin });
  say(opts, verify.haveYg
    ? `verification: ${verify.verified} deterministic aspect(s) drilled against a real Yggdrasil (${verify.ygBin}) — ${aspects.filter(a => a.finalStatus === 'enforced').length} promoted to \`status: enforced\`, ${aspects.filter(a => a.finalStatus === 'advisory').length} to \`status: advisory\` (sub-gate origin, below grain's own certification bound)${verify.timedOut ? `; ${verify.timedOut} drill(s) gave up after ${verify.drillTimeoutMs / 1000}s and left their aspect unverified` : ''}`
    : 'verification: skipped — no Yggdrasil CLI found (set YG_BIN to a built bin.js, or put `yg` on PATH); every deterministic aspect ships `status: draft`, unverified');

  // sizing.json — files/bytes/scopes/codelength per proposed node, and per HAND node when the source repo
  // already carries its own `.yggdrasil/` (see §7.5 above for what is derived vs. an external constant)
  const hasHandGraph = existsSync(join(repo, '.yggdrasil'));
  const handGraphForSizing = hasHandGraph ? readGraph(repo) : null;
  const sizing = computeSizing(repo, nodes, handGraphForSizing, files);
  write(join(outDir, 'sizing.json'), JSON.stringify({ instrument: sizing.instrument, repo, asOf: exp.asOf, ...sizing }, null, 1) + '\n');

  const { chartersWritten, charterLines } = writeCharters(ygg, { nodes, aspects, sizing, exp, nodeOfFile, repo, ev });
  say(opts, `charters: ${chartersWritten} written, avg ${(charterLines / Math.max(1, chartersWritten)).toFixed(1)} lines`);

  // the documents a human actually reads
  const aspectsByDraftReason = {};
  for (const a of aspects) if (a.draftReason) aspectsByDraftReason[a.draftReason] = (aspectsByDraftReason[a.draftReason] || 0) + 1;
  // §class 4 (ticket 120): "a type with nothing attached obliges nothing" — a proposed node type that hosts no
  // aspect (`a.aspectIds`, set by `buildAspects` just above) AND is on neither side of any measured dependency
  // edge (`rels.pairs`, the same edges `writeArchitecture` turns into the graph's own relations) is real coverage
  // — the maintainer still needs the node to see the directory at all — but obliges the code inside it to
  // nothing. Still emitted; only DISCLOSED, in `PROPOSAL.md` and in the report's on-disk line below.
  const typesInRelations = new Set();
  for (const k of rels.pairs.keys()) { const [a, b] = k.split('|'); typesInRelations.add(a); typesInRelations.add(b); }
  const typesWithNoLaw = active.filter(a => (a.aspectIds || []).length === 0 && !typesInRelations.has(a.id));
  const counts = {
    types: active.length, alternatives: alternatives.length, nodes: nodes.length,
    // the cut, by the level each active type was cut at, and the candidates by the level each was offered at
    // (ticket 110) — `typesByLevel` sums to `types` and `alternativesByLevel` to `alternatives`
    typesByLevel: countBy(active, a => a.source), alternativesByLevel: countBy(alternatives, a => a.level),
    aspects: aspects.length, aspectsRenderedAsCheck: aspects.filter(a => a.check).length, aspectsProse: aspects.filter(a => !a.check).length,
    // status split (ticket 102, three-way since ticket 107) — `aspectsActive` (kept named for schema stability;
    // it counts `status: enforced`) is what a plain `yg check` on this proposal BLOCKS on. `aspectsAdvisory`
    // (ticket 107) is the same drilled bar cleared by a sub-gate-lattice origin instead — `yg check` runs the
    // reviewer and records a baseline, but a refusal warns rather than blocks. `aspectsDraft` is everything
    // that never left `draft`, split by WHY (`aspectsByDraftReason`, see `promoteEnforceableAspects`).
    aspectsActive: aspects.filter(a => a.finalStatus === 'enforced').length,
    aspectsAdvisory: aspects.filter(a => a.finalStatus === 'advisory').length,
    aspectsDraft: aspects.filter(a => a.finalStatus === 'draft').length,
    aspectsByDraftReason,
    aspectsVerified: verify.verified, aspectsVerifiedAgainst: verify.haveYg ? verify.ygBin : null,
    aspectsSkippedUnrenderableGroupScoped: skipped.unrenderableGroupScoped, aspectsSkippedNotARule: skipped.notARule,
    // ticket 120, additive: WHY a row was skipped as not-a-rule (`parser-node-type-as-identifier` |
    // `generic-type-parameter-as-domain-type`), same shape as `proseByClass` beside it.
    aspectsSkippedNotARuleByReason: skipped.notARuleByReason, proseByClass: skipped.byClass,
    aspectsAbsenceNotForbiddance: skipped.absence,
    // ticket 120 §class 3, additive: sub-gate rows measured within a role-group cluster narrower than the scope
    // a check would enforce, for which no exact scope (an explicit file list or a shared `content:` predicate)
    // could be derived — these stay `draft`, `draftReason: cluster-narrower-than-scope`, forever unpromotable.
    aspectsClusterNarrowerThanScope: skipped.clusterNarrowerThanScope,
    drillCases, drillHoldout: opts.holdout || null, drillDropped, nodeCycles: nodeCycles.length,
    latticeRows: lat.rows.length, subGate: sub.length, denies: rels.denies.length, denyBacklog: rels.backlog.length,
    sizingHandNodes: sizing.handNodes ? sizing.handNodes.length : null,
    charters: chartersWritten, charterAvgLines: chartersWritten ? +(charterLines / chartersWritten).toFixed(1) : null,
    // ticket 120 §class 4, additive: a proposed node type with no aspect attached AND on neither side of any
    // measured dependency edge — real coverage, but obliges nothing. See `typesWithNoLaw` below for the list.
    typesWithNoLaw: typesWithNoLaw.length,
  };
  write(join(outDir, 'PROPOSAL.md'), renderProposalMd({ repo, exp, files, active, alternatives, nodes, aspects, rels, sub, lat, counts, typesWithNoLaw }));
  write(join(outDir, 'REFACTOR-BACKLOG.md'), renderBacklogMd({ exp, sub, rels, nodeCycles }));
  write(join(outDir, 'alternatives.md'), renderAlternativesMd({ alternatives }));
  // proposal.json — the published, versioned interface (ticket 100, "the proposal contract" in docs/reference.md).
  // `schema`/`engine`/`extractor`/`schemaNotes` are ADDED here, alongside the `instrument`/`repo`/`asOf`/`files`/
  // `counts`/`evidence` fields 094/097/098 already read — nothing existing is renamed or removed, so a reader of
  // last wave's proposal.json keeps working unmodified (docs/reference.md, "additive fields only, never a
  // silent shape change").
  write(join(outDir, 'proposal.json'), JSON.stringify({
    schema: 'grain-proposal/1',
    engine: ENGINE_VERSION,
    extractor: EXTR_V,
    instrument: 'propose/1', repo, asOf: exp.asOf, files: files.length, counts,
    schemaNotes: {
      evidence:
        'one row per emitted element (`kind`: `type` | `alternative` | `relations` | `deny` | `node` | `charter` | `aspect`), `id` names the element, `evidence` is the exact prose a human reads on the file itself (a `# evidence:` YAML comment, or the corresponding line in the rendered .md); everything else on the row is `kind`-specific structured detail (e.g. an `aspect` row carries `enumerator`/`identifier`/`expected`/`host`, plus — ticket 102, three-way since 107 — `status` (`enforced` | `advisory` | `draft`, the same values Yggdrasil\'s own `yg-aspect.yaml` takes) and `draftReason` (`prose-unenforceable-keyless` | `absence-not-forbiddance` | `file-scope-approximation-fa` | `no-catch` | `null`) matching the aspect\'s own `provenance.json`). This is the full audit trail: every element this renderer wrote has exactly one row here. Ticket 110, additive: a `type` row carries `level` (the cut it came from) and `levels` (every level that independently named the same directory), and an `alternative` row — one per candidate the run did NOT activate, previously present only in `alternatives.md` — carries `level`, `form` (`content` | `path` | `list`), `of` (the active type it would be carved out of), `selects`, `fidelity` and `viable`. Both kinds carry `intrinsic`: the oracle-free evidence for that cut — `files`, `importsInside`/`importsCrossing` (resolved imports touching the set, split by whether both endpoints are in it), `cochangeInside`/`cochangeCrossing`, `nameShape`/`nameShapeFiles` (the modal file-name shape and how many files carry it), `mined` (how many of the files grain parsed at all) and `rules` (mined conventions every one of whose sites lies inside the set).',
      counts:
        'summary tallies over the SAME run this proposal.json describes — `typesByLevel`/`alternativesByLevel` (ticket 110) split `types` and `alternatives` by the level each was cut or offered at (`partition` | `module` | `directory` | `domain` | `role group` | `layout`); `aspects` = every drafted aspect (certified-convention + sub-gate-lattice combined), `aspectsRenderedAsCheck`/`aspectsProse` partition it by reviewer kind, `aspectsActive`/`aspectsAdvisory`/`aspectsDraft`/`aspectsByDraftReason` partition it by earned status (ticket 102, three-way since 107 — see `provenance.json`\'s own `status`/`draftReason`): `aspectsActive` counts `status: enforced` (a certified-convention origin that cleared a real drill — nothing stands between the maintainer and turning it on), `aspectsAdvisory` counts `status: advisory` (a sub-gate-lattice origin that cleared the SAME drill but sits below grain\'s own certification bound — a refactor decision, not law; these are the report\'s `candidates`), `aspectsDraft` is everything that never cleared the drill at all. `aspectsVerified`/`aspectsVerifiedAgainst` say how many deterministic aspects a real `yg drill` actually judged this run and against which Yggdrasil binary (`null` when `YG_BIN` was not resolvable — every aspect then ships draft, unverified), `charters`/`charterAvgLines` cover the charter.md written per node (§ below).',
      provenance:
        'NOT inlined here — each `.yggdrasil/aspects/<id>/provenance.json` (same field set as ticket 097\'s law-loop.mjs: aspectId, conventionId, origin, enumeratorClass, identifier, expected, partition, share, n, deviating, asOf, cutSha, cutDate, repo, reviewer, note — PLUS, ticket 102, `status`/`draftReason`/`scopeApproximation`, and, ticket 118, `existingViolations` (the count of sites that break the rule at `asOf` — the same number as `deviating`, named for what it costs on the day the graph is switched on), additive fields law-loop.mjs\'s own replay provenance does not carry) is the per-aspect record; this file\'s `evidence` rows are the prose summary, provenance.json is the structured one a machine reads.',
      sizing:
        'NOT inlined here — `sizing.json` alongside this file carries files/bytes/codelength-lines/scopes per proposed (and, where the source repo already carries its own `.yggdrasil/`, per HAND) node; every node\'s `charter.md` quotes its own row under "## Sizing".',
      charter:
        'one `charter.md` per non-organizational AND organizational node, written beside its `yg-node.yaml` under `.yggdrasil/model/<node>/` — Horde\'s `node.mjs show` reads it verbatim. Sections: what lives here, depends on / used by (module edges with counts), certified conventions (share/n/deviating + status + drill numbers + exemplars), rules inherited from above (ticket 114 — every rule that reaches this node\'s files through Yggdrasil\'s own cascade from an ancestor node or an ancestor node\'s architecture type, each marked with where it is declared), sub-gate candidates, co-change partners, sizing, and the `asOf` sha.',
      familyCandidates:
        'NOT part of this file — `propose.mjs --family-candidates <out.json>` writes a SEPARATE `.family-candidates.json` in the exact shape Yggdrasil\'s `yg advise` (`parseFamilyCandidates`, `advise-nominations.ts`) already accepts; see `buildFamilyCandidates` and docs/reference.md, "The proposal contract".',
    },
    evidence,
  }, null, 1) + '\n');

  return { outDir, active, alternatives, nodes, aspects, rels, sub, lat, evidence, files, exp, counts, nodeCycles, sizing, loc, verify, degraded, progressive };
}

// ---- aspect drafting ----
//
// Two sources, one shape. A CERTIFIED convention is a claim grain is willing to make; a SUB-GATE row is a claim
// it refuses to make and a maintainer still wants to see. Both are rendered the same way: a deterministic check
// where the enumerator class renders, prose where it does not, and in both cases the provenance (share, n, sites,
// asOf) in the description, `status: draft`, and a drill corpus cut from the sites themselves.
//
// `filebirth` is excluded from drafting entirely. "Types here are new" is a statement about the repository's
// history, not about how a file should be written; making it an aspect would be a category error.
// ==================================================================================================
// 7-bis. THE OBLIGATION FORM — the one thing this renderer does to a mined sentence (ticket 109).
//
// `verbalize` (engine/core.mjs) writes a mined fact in the INDICATIVE, because grain's own query surface
// REPORTS what the code does: "methods here are annotated with `[Then]`". An aspect is not a report. It is the
// sentence a future agent session is held to, read cold, months later, with no access to the run that mined it
// and no way to ask what "here" meant. Ticket 101's independent judge read 14 of 20 such rows as "not a rule,
// an observation"; ticket 109 measures whether the WORDING is what costs that, by changing the wording and
// nothing else.
//
// Three things this section deliberately does NOT do:
//   - It re-measures nothing. `share`, `n`, `deviating`, the `check.mjs` body, the id, the scope predicate and
//     the status are the same bytes before and after — 109 diffs every rendered tree round to round to prove
//     it, and a difference outside a prose field fails the round.
//   - It does not touch `verbalize`. Those sentences are grain's OWN report surface (`grain where`, `grain
//     what`, `grain explain`, and the README's examples), read by an agent mid-edit who asked what the code
//     does. One vocabulary, two moods: the miner reports, the aspect obliges.
//   - It adds no hedge. "must" and "may not" are the whole point. A rule that says "should probably" is a rule
//     the next session argues with, which is the failure this section exists to remove.
// ==================================================================================================
