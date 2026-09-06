// The proposal renderer — turn grain's model into a PROPOSED `.yggdrasil/` graph.
//
// The north star (decisions.md `north-star-brownfield-miner`) is a maintainer adopting Yggdrasil on a brownfield
// repository. `tests/stress/reconstruct.mjs` (ticket 093) measured how much of a hand-written graph grain's
// export ALREADY holds; this module is the other half — it writes the graph grain can propose, so the maintainer
// starts from a draft with evidence attached instead of from an empty directory.
//
// It was an instrument (`tests/stress/propose.mjs`, ticket 094) until ticket 104 made `grain propose` a product
// command: the whole render pipeline moved here VERBATIM, and the instrument is now a thin wrapper that imports
// this module, adds the `--score` comparison against a hand-written graph, and keeps its own CLI flags. The
// dispatcher's `propose` command (`cmdPropose`, engine/grain.mjs) drives `propose()` below and renders the
// report; nothing about what lands on disk depends on which of the two called it.
//
// THREE RULES THIS MODULE OBEYS.
//
//   1. NEVER write into the repository's own `.yggdrasil/`. Everything lands under `<out-dir>/.yggdrasil/`, a
//      directory the maintainer reads, edits and moves in by hand. The repository is untouched but for one
//      thing, named here rather than glossed over: the export this module spawns for itself is written to
//      `.grain/cache/`, the disposable half of grain's own store, which `.grain/.gitignore` already ignores —
//      so a run leaves the working tree clean, and nothing it wrote can be committed by accident.
//   2. EVERY proposed element carries an evidence line — counts, paths, shares — naming what in the repository
//      made grain propose it. A proposal without evidence is a guess with a YAML syntax, and the whole point of
//      the north star is that the graph comes from the code rather than from imagination. The evidence is both a
//      `# evidence:` comment in the YAML and a row in `<out-dir>/proposal.json`.
//   3. NOTHING IS ASSERTED AS TRUE UNTIL IT HAS EARNED IT. Every aspect ships `status: draft` by default (the
//      reviewer is skipped, no verdict, no baseline); no type ever carries `enforce: strict`. A prose aspect
//      (`content.md`, an LLM judgment call) NEVER leaves draft here — ticket 101 measured its sense rate under
//      a keyless gate at 0% (ruling `prose-aspects-draft-by-default`) — and its `content.md` says so. A
//      deterministic aspect (`check.mjs`) is promoted to `status: enforced` ONLY when a Yggdrasil CLI resolves
//      and a REAL `yg drill` on the just-written proposal, in a throwaway staging copy, confirms it: zero
//      FALSE-ALARMs and at least one caught `violates-*` case. A check that false-alarms stays draft with
//      `draftReason: file-scope-approximation-fa` (ruling `drill-fa-labelling-is-acceptance-not-defect` — the
//      convention's own subject is a symbol inside the file, Yggdrasil's unit is the file, and the label is
//      what is wrong, not the check); a check that catches nothing stays draft with `draftReason: no-catch`
//      (ruling `no-catch-rules-stay-draft`). With no Yggdrasil CLI every deterministic aspect stays draft too,
//      unverified. The honest limits — above all that a rule about an ABSENCE can never come from mining — are
//      printed at the top of every file a human opens either way.
//
// `grain export` is driven as a SUBPROCESS (`bin/grain.mjs export --out …`) rather than called in-process: it is
// the same code path either way, and the subprocess keeps the export's own memory profile (a full parse of every
// tracked file) out of the process that then renders. `core.mjs` is imported dynamically, only when the sub-gate
// lattice is actually computed. Verifying against Yggdrasil (`yg drill`) runs the built CLI as a subprocess over
// a throwaway copy of this renderer's own output, exactly as `tests/propose.test.mjs` already does.
//
// The split of this file (ticket 124) is in progress: the seams already cut live in the sibling
// modules re-exported at the bottom, and every name this file exported before the split is still
// exported here.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { readGraph, intersectSize } from './yggdrasil-graph.mjs';
import { ENGINE_VERSION, EXTR_V } from './config.mjs';
import { buildAspects, describeRow } from './propose-aspects.mjs';
import {
  BIN,
  PREAMBLE,
  SCHEMA_VERSION,
  gitFiles,
  pct,
  preambleComment,
  progressiveReference,
  say,
  slug,
  uniq,
  write,
  yamlEmit,
} from './propose-base.mjs';
import { isAbsenceRow } from './propose-classify.mjs';
import { cutDrills, mdTable } from './propose-drills.mjs';
import { nodeCochangePairs } from './propose-family.mjs';
import { partitionLattice, subGate } from './propose-lattice.mjs';
import { TYPE_LEVELS, countBy, levelSentence, localities } from './propose-levels.mjs';
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
// ==================================================================================================
// 7c-bis. THE CASCADE, AS YGGDRASIL RUNS IT (ticket 114).
//
// A grain proposal attaches every mined rule to a TYPE (`a.host` is a type id, written into
// `yg-architecture.yaml` under `node_types.<type>.aspects`). The node that actually OWNS the files is often a
// nested one whose own type hosts nothing: on spring-petclinic the 30 Java files belong to
// `src/main/java/org`, while all 8 mined rules sit on the `src-main-java` type one level up. Yggdrasil
// resolves that correctly — `yg context --file` lists all 8 — because its cascade
// (`core/graph/aspects.ts`, `iterateAttachments`) walks six channels, in this order:
//
//   1. the node's own `aspects:`            4. an ANCESTOR node's architecture type's `aspects:`
//   2. an ANCESTOR node's own `aspects:`    5. flow aspects
//   3. the node's own architecture type's `aspects:`   6. port-consumption aspects
//
// The charter was per-node and flat, so the owner assigned to the node holding the code read "none certified
// yet at this node" about code governed by eight rules — and the charter is the ONLY file the layer above the
// graph reads (Horde's `node.mjs show` prints it verbatim; nothing there opens `yg-architecture.yaml`).
//
// This walk is the same walk, restricted to the channels a grain proposal can populate. Channels 5 and 6 are
// structurally empty here — this renderer writes no `yg-flow.yaml` and no `ports:` — so they are not walked
// rather than walked and found empty. Channels 1 and 2 ARE walked, off `n.aspectIds`, even though the node
// writer attaches nothing there today: the moment it does, the charter follows without a second edit.
// Ancestors are the node-path chain, ROOT-FIRST, exactly as `collectAncestors` returns it.
//
// Effective STATUS is not recomputed here. Yggdrasil takes max() across the channels that attach an aspect;
// this renderer writes a bare id at every attach site (no `status:` override — see `writeArchitecture`), so
// the only status in play is the aspect's own, which is what each row prints.
const ancestorNodesOf = (n, nodes) => nodes
  .filter(p => p !== n && p.id !== n.id && n.id.startsWith(p.id + '/'))
  .sort((a, b) => a.id.split('/').length - b.id.split('/').length);
export function effectiveAspectsForNode(n, nodes, aspects) {
  const ancestors = ancestorNodesOf(n, nodes);
  const byId = new Map(aspects.map(a => [a.id, a]));
  const seen = new Set();
  const own = [], inherited = [];
  const take = (a, into, via) => { if (!a || seen.has(a.id)) return; seen.add(a.id); into.push(via ? { a, via } : a); };
  for (const id of n.aspectIds || []) take(byId.get(id), own);                                  // channel 1
  for (const a of aspects) if (a.host && a.host === n.type) take(a, own);                       // channel 3
  for (const p of ancestors) for (const id of p.aspectIds || []) take(byId.get(id), inherited, `inherited from ancestor node \`${p.id}\``); // channel 2
  for (const p of ancestors) for (const a of aspects) if (a.host && a.host === p.type) take(a, inherited, `inherited from type \`${p.type}\`, on ancestor node \`${p.id}\``); // channel 4
  return { own, inherited };
}
// One rule, one line, in the words the report and the aspect file already use. `status` is the word Yggdrasil's
// own `yg-aspect.yaml` carries (`yg schemas read aspect`), and the drill numbers are the ones the proposal's
// report prints for the same rule — so a reader meeting a rule in the charter and again in the report meets one
// account of it, not two.
const charterStatusOf = a => a.finalStatus || 'draft';
// A drill with nothing planted (`violates: 0`) says nothing about the check, so the row says nothing about the
// drill — "caught 0 of 0" reads as a failure and is not one.
const charterDrillOf = a => (a.drill?.violates ? ` · drill: caught ${a.drill.catches} of ${a.drill.violates} · ${a.drill.falseAlarm} false alarm(s)` : '');
const charterShareOf = a => (typeof a.share === 'number' ? a.share.toFixed(3) : String(a.share));
export function renderNodeCharter(n, { nodes, aspects, sizingByNode, cochangeByNode, asOf, repo }) {
  const L = [`# Charter — \`${n.id}\``, '', ...PREAMBLE.map(l => (l ? `> ${l}` : '>')), ''];
  // THE CHARTER OPENS WITH WHAT THE NODE OBLIGES, NOT WITH HOW IT WAS CUT (ticket 109). `n.why` is the
  // miner's reason for the grouping; it is still here, one line down, under "grouped because". What a session
  // opening this file needs first is which files it is responsible for and what it may reach.
  L.push(n.organizational
    ? `Organizational node — it owns no file of its own. Every file under \`model/${n.id}/\` belongs to one of its children; attach a rule to the child that owns the file, never here.`
    // A ROOT-GLOB NODE HAS NO DIRECTORY (ticket 109 round 2). `n.dir` is `null` for the type cut from a
    // partition whose files all sit at the repository root, and interpolating it printed "Everything under
    // `null/`" at a maintainer.
    : `${n.dir ? `Everything under \`${n.dir}/\`` : 'Every file that sits at the repository root itself'} is this node's: ${n.files.size} tracked file${n.files.size === 1 ? '' : 's'}${n.ownFiles.size === n.files.size ? ', all of them owned here' : `, ${n.ownFiles.size} owned here and ${n.files.size - n.ownFiles.size} by a nested node below it`}. A rule attached to this node applies to every file it owns.`, '');

  if (!n.organizational) {
    L.push('## What lives here', '', `- ${n.files.size} tracked files mapped to ${n.dir ? `\`${n.dir}/\`` : 'the repository root'}${n.ownFiles.size === n.files.size ? '' : ` (${n.ownFiles.size} owned directly; the other ${n.files.size - n.ownFiles.size} belong to a nested node)`}`);
    const extCounts = new Map();
    for (const f of n.ownFiles) { const m = /\.([A-Za-z0-9]+)$/.exec(f); const ext = m ? m[1] : '(no extension)'; extCounts.set(ext, (extCounts.get(ext) || 0) + 1); }
    const topExts = [...extCounts].sort((a, b) => b[1] - a[1]).slice(0, 6);
    if (topExts.length) L.push(`- file types: ${topExts.map(([e, c]) => `\`.${e}\` ×${c}`).join(' · ')}`);
    if (n.contains?.length) L.push(`- groups: ${n.contains.map(id => `\`${id}\``).join(' · ')}`);
    L.push(`- grouped because: ${n.why}`);
    L.push('');
  }

  L.push('## What this node may depend on', '');
  const dep = n.relations || [];
  const used = nodes
    .filter(x => x !== n)
    .flatMap(x => (x.relations || []).filter(r => r.target === n.id).map(r => ({ from: x.id, n: r.n })))
    .sort((a, b) => b.n - a.n);
  L.push(dep.length
    ? `- may depend on: ${dep.map(r => `\`${r.target}\` (${r.n} resolved import${r.n === 1 ? '' : 's'})`).join(' · ')}. A dependency on any other node is refused by \`yg check\` until it is declared here.`
    : '- may depend on: nothing is declared yet. `yg check` refuses a dependency on another node until it is declared here, so declare the relation before the first import.');
  L.push(used.length
    ? `- depended on by: ${used.map(r => `\`${r.from}\` (${r.n} resolved import${r.n === 1 ? '' : 's'})`).join(' · ')}. Changing what this node exposes breaks them.`
    : '- depended on by: no other node imports this one.', '');

  // An aspect's `host` is the TYPE that carries it in `yg-architecture.yaml`; a node's own `id` is a PATH
  // (`src/main/java`) and `n.type` is that type id (`src-main-java`). Matching the host against the id is
  // a category error that empties every charter the moment a directory name is not already its own slug —
  // and the charter is the one file the layer above the graph reads. `effectiveAspectsForNode` above walks
  // the rest of the cascade, so a node whose OWN type hosts nothing still reads the rules that reach its
  // files from an ancestor (ticket 114).
  const { own: hosted, inherited } = effectiveAspectsForNode(n, nodes, aspects);
  const certified = hosted.filter(a => a.origin === 'certified-convention');
  const subgate = hosted.filter(a => a.origin === 'sub-gate-lattice');
  L.push('## Certified conventions', '');
  if (certified.length) {
    for (const a of certified) {
      L.push(`- ${a.name} — share ${charterShareOf(a)} · n ${a.n} conforming, ${a.deviating} deviating · status \`${charterStatusOf(a)}\`${charterDrillOf(a)} (\`${a.id}\`)`);
      if (a.exemplars?.length) L.push(`  exemplars to copy: ${a.exemplars.map(e => `${e.rel}:${e.line}`).join(', ')}`);
    }
  } else {
    // NEVER A DEAD END WHERE RULES DO REACH THE FILES. "none certified yet at this node" was literally true
    // and practically false on the one node that owns the code: the rules are attached one level up, and the
    // reader is told where to look rather than told there is nothing.
    L.push(inherited.length
      ? `- (none attached at this node itself — but ${inherited.length} rule${inherited.length === 1 ? '' : 's'} reach${inherited.length === 1 ? 'es' : ''} these files from above; they are in **Rules inherited from above** below and they are in force here)`
      : '- (none certified yet at this node)');
  }
  L.push('');
  // The same rules `yg context --file` lists for a file this node owns, arriving through the cascade rather
  // than attached here. Each row says where it comes from, so a reader knows which file to edit to change it.
  L.push('## Rules inherited from above', '');
  if (inherited.length) {
    for (const { a, via } of inherited) {
      L.push(`- ${a.name} — ${via} · status \`${charterStatusOf(a)}\` · share ${charterShareOf(a)} · n ${a.n} conforming, ${a.deviating} deviating${charterDrillOf(a)} (\`${a.id}\`)`);
      if (a.exemplars?.length) L.push(`  exemplars to copy: ${a.exemplars.map(e => `${e.rel}:${e.line}`).join(', ')}`);
    }
    L.push('', 'These are not attached here and cannot be changed here: each one is declared on the type or node named beside it, and applies to every file below it. `yg check` judges this node\'s files against them exactly as it judges the node that declares them.');
  } else {
    L.push('- (no rule reaches this node from an ancestor node or type)');
  }
  L.push('');
  L.push('## Sub-gate candidates — evidence, not yet law', '');
  if (subgate.length) {
    for (const a of subgate) {
      L.push(`- ${a.name} — share ${charterShareOf(a)} · practised in ${a.n} · ${a.deviating} sites do not · status \`${charterStatusOf(a)}\`${charterDrillOf(a)} (\`${a.id}\`)`);
    }
  } else {
    L.push('- (none below the certification bound worth naming)');
  }
  L.push('');

  L.push('## Co-change partners', '');
  const cc = cochangeByNode.get(n.id) || [];
  L.push(cc.length ? cc.map(c => `- \`${c.partner}\` — ${c.support} shared commit${c.support === 1 ? '' : 's'}`).join('\n') : '- (no other node co-changes with this one above the support floor)', '');

  L.push('## Sizing', '');
  const sz = sizingByNode.get(n.id);
  L.push(sz
    ? `- ${sz.files} files · ${sz.bytes} bytes · ${sz.codelengthLines} lines · ${sz.scopes == null ? 'scopes unavailable (no `.grain/cache/tree.json`)' : `${sz.scopes} scopes`} (see \`sizing.json\`)`
    : '- (no sizing recorded — organizational node, or `sizing.json` was not written)', '');

  L.push('## As of', '', `\`${asOf}\`${repo ? ` — ${repo}` : ''}`, '');
  return L.join('\n');
}
function renderProposalMd({ repo, exp, files, active, alternatives, nodes, aspects, rels, sub, lat, counts, typesWithNoLaw = [] }) {
  const L = [];
  const notARuleByReason = counts.aspectsSkippedNotARuleByReason || {};
  L.push('# Proposed `.yggdrasil/` graph', '', ...PREAMBLE, '', '---', '',
    `Repository: \`${repo}\` at \`${(exp.asOf || '').slice(0, 8)}\` · ${files.length} tracked files · grain: ${(exp.partitions || []).length} partitions, ${(exp.moduleGraph?.nodes || []).length} modules, ${(exp.conventions || []).length} certified conventions, ${(exp.edges || []).length} resolved imports.`, '',
    `Proposed: **${active.length} node types**, **${nodes.length} nodes**, **${aspects.length} aspect drafts** (${counts.aspectsRenderedAsCheck} rendered as a deterministic \`check.mjs\`, ${counts.aspectsProse} as prose), **${counts.drillCases} drill cases**, **${alternatives.length} finer type alternatives** you choose between (see \`alternatives.md\`), and a refactor backlog (\`REFACTOR-BACKLOG.md\`).`, '',
    '## What this proposal does NOT contain, counted', '',
    mdTable(['left out', 'count', 'why'], [
      ['group-scoped conventions with no marker', counts.aspectsSkippedUnrenderableGroupScoped, 'the rule holds inside a role group, and the group offers no marker, name shape or shared import to turn into a `content:` predicate. There is no honest way to say WHERE the rule applies, so it is disclosed rather than approximated.'],
      ['history facts that are not rules', notARuleByReason.filebirth || (counts.aspectsSkippedNotARule - Object.values(notARuleByReason).reduce((a, b) => a + b, 0)) || 0, '`filebirth` says "the code here is new". That is a fact about the repository, not about how a file should be written.'],
      ['a parser node type as the identifier', notARuleByReason['parser-node-type-as-identifier'] || 0, 'the value mined is one of the grammar\'s own node type names (`call_expression`, `identifier`, …) — true, checkable, and not anything a developer wrote, so no agent could obey it.'],
      ['a generic type parameter as a domain type', notARuleByReason['generic-type-parameter-as-domain-type'] || 0, 'the value looks like a type parameter (`S`, `V`, `TResult`) and is never declared as a real type anywhere in the repository this export saw — obeyable, but not a rule about the domain.'],
      ['rules about an ABSENCE', 'unknowable', 'a miner of practice leaves no trace of what a repository never does. These must be written by hand.'],
    ]), '',
    `Of the ${aspects.length} drafted, ${counts.aspectsProse} could not be rendered as a check because the convention asserts a SHAPE rather than a name` + (Object.keys(counts.proseByClass || {}).length ? ` — by class: ${Object.entries(counts.proseByClass).sort((a, b) => b[1] - a[1]).map(([k, v]) => `\`${k}\` ${v}`).join(', ')}` : '') + '. Each such aspect says so in its own `content.md`.', '',
    counts.nodeCycles
      ? `**This proposal is RED on \`yg check\`, for one reason:** ${counts.nodeCycles} dependency cycle(s) in the proposed node graph. Yggdrasil cannot express a loop, and the proposal declares every dependency the code contains rather than quietly dropping one. See \`REFACTOR-BACKLOG.md\` §4 — that is the first thing to fix, and it is a finding about the repository, not about the proposal.`
      : 'The proposed node graph is acyclic.', '',
    counts.drillHoldout
      ? `Drills are cut with a TIME HOLD-OUT at ${counts.drillHoldout} (${counts.drillDropped} pre-cut sites dropped), by the export's per-site first-appearance date rather than by a cut sha.`
      : '**Drills carry NO hold-out.** Every case is cut from the sites the rule was mined on, so a passing drill shows only that the rendered check reproduces grain\'s own count. Re-cut with `--holdout <YYYY-MM-DD>`.', '');
  L.push('## Node types', '', mdTable(['type', 'level', 'levels agreeing', 'evidence files', '`when` selects', 'fidelity', 'imports inside', 'grain read', 'rules', 'uses'],
    active.map(a => {
      const m = a.evidence || {};
      const touching = (m.importsInside || 0) + (m.importsCrossing || 0);
      return [`\`${a.id}\``, a.source, (a.levels || [a.source]).join(', '), a.files.size, a.selected.size, a.fidelity.toFixed(2),
        touching ? `${m.importsInside}/${touching}` : 'none either way', `${m.mined ?? 0}/${m.files ?? 0}`, m.rules ?? 0, (rels.uses.get(a.id) || new Map()).size];
    })));
  L.push('', 'Fidelity is the renderer checking its own work: the Jaccard overlap between the file set the evidence',
    'names and the file set the drafted `when` predicate actually selects when expanded against `git ls-files`.',
    'A type below 1.00 selects files the evidence does not name (usually files grain has no grammar for, which',
    'live in the same directory and are correctly classified anyway).', '',
    'THE LEVEL IS PUBLISHED, NOT CHOSEN FOR YOU (ticket 110). `level` is the cut this type came from; `levels',
    'agreeing` names every level that independently landed on the same directory. A finer directory becomes a',
    'type of its own only where it beats the level above it on that level\'s own evidence — strictly more of its',
    'imports stay inside, or grain could read none of its files while it could read the parent\'s. Every',
    'candidate that did not clear that comparison is in `alternatives.md` with the same numbers, grouped by its',
    'own level, so a maintainer can choose a different level per subtree.', '',
    mdTable(['level', 'active types', 'candidates offered'],
      TYPE_LEVELS.filter(l => counts.typesByLevel?.[l] || counts.alternativesByLevel?.[l])
        .map(l => [l, counts.typesByLevel?.[l] || 0, counts.alternativesByLevel?.[l] || 0])), '');
  L.push('## Aspect drafts', '', mdTable(['origin', 'count', 'rendered as `check.mjs`', 'prose'], [
    ['certified convention', aspects.filter(a => a.origin === 'certified-convention').length, aspects.filter(a => a.origin === 'certified-convention' && a.check).length, aspects.filter(a => a.origin === 'certified-convention' && !a.check).length],
    ['sub-gate lattice', aspects.filter(a => a.origin === 'sub-gate-lattice').length, aspects.filter(a => a.origin === 'sub-gate-lattice' && a.check).length, aspects.filter(a => a.origin === 'sub-gate-lattice' && !a.check).length],
  ]), '',
    'Every rendered check carries `errs: under`: it reports a violation only where the syntax tree PROVES the',
    'negation, and stays silent where the language gives it nothing to read. A rule about a declared return type',
    'fires on a declaration that declares a different one and never on a declaration that declares none. That is',
    'a contract the template keeps, not a label — and `yg drill` on the corpus beside each check is how you hold',
    'it to that contract.', '');
  L.push(`The sub-gate half comes from a per-partition lattice of ${lat.rows.length} cells${lat.reason ? ` — ${lat.reason}` : ''}, of which ${sub.length} sit in the band between the repository's own two-thirds supermajority and grain's certification bound. \`grain explain <file>\` shows the same cells for one file at a time as its \`[obs ]\` rows; this is that surface aggregated per partition, which is what a maintainer needs and what no shipped command prints today.`, '');
  L.push('## Established negatives', '',
    'Grain publishes a pair as an established negative when the ABSENCE of the dependency compresses. That is a',
    'statement about what is PRACTICED. An architecture `deny` is a statement about what is PERMITTED. Where the',
    'code contains an import a `deny` would forbid, the two statements are both true about different things —',
    'class (c), undecidable without a human — and the negative stays a backlog line rather than becoming a rule',
    'that contradicts the code.', '',
    mdTable(['from', 'to', 'share', 'became', 'why'],
      [...rels.denies, ...rels.backlog].map(d => [`\`${d.from}\``, `\`${d.to}\``, d.share.toFixed(3), d.becomes, d.whyNot || 'nothing observed contradicts it'])), '');
  // §class 4 (ticket 120): a proposed type that hosts no aspect and is on neither side of any measured
  // dependency edge obliges nothing — still emitted, since the maintainer needs the node to see the directory
  // at all (coverage), but it is not law, and a reader of the graph alone cannot tell that from a type that
  // simply has not been reviewed yet. Named here so they can.
  L.push('## Types with no law', '',
    typesWithNoLaw.length
      ? 'These node types carry no aspect draft and appear on neither side of any measured dependency edge. They are still emitted — the directory needs a node to be reviewable at all — but nothing here obliges the code inside it to anything.'
      : 'Every proposed type either hosts an aspect draft or takes part in a measured dependency edge — none is law-free.', '',
    typesWithNoLaw.length ? mdTable(['type', 'files'], typesWithNoLaw.map(a => [`\`${a.id}\``, a.files.size])) : '', '');
  return L.join('\n') + '\n';
}
function renderAlternativesMd({ alternatives }) {
  const L = ['# Finer type candidates — your choice, not grain\'s', '', ...PREAMBLE, '', '---', '',
    'Every candidate below is a cut of the same tree the active types cut, at a level this proposal did NOT',
    'activate. They are grouped by that level, because ticket 108 measured four hand-written architectures and',
    'no single level won: the module level recovers most of one repository, the directory level most of another,',
    'the role group most of a third. Which level is right for a subtree is the maintainer\'s call, and this file',
    'is the material for it.', '',
    'Each row carries the SAME intrinsic numbers the active types carry in `yg-architecture.yaml` — files, how',
    'much of the import traffic touching the candidate stays inside it, how much of it grain could read at all,',
    'and how many mined rules have every site inside it — so a candidate can be compared against the active type',
    'above it (`of`) without running anything. The `selects` column is the drafted predicate EXPANDED against',
    'the repository, a measured count and not a promise.', '',
    'Nothing here is active. To adopt one: paste its `when` into `yg-architecture.yaml` as a new type, and add',
    'a `not:` for it to the parent type listed in `of`.', ''];
  const head = ['candidate', 'of', 'form', 'group files', 'selects', 'J', 'viable', 'imports inside', 'grain read', 'rules', 'evidence'];
  const row = a => {
    const m = a.evidence || {};
    const touching = (m.importsInside || 0) + (m.importsCrossing || 0);
    return [`\`${a.id}\``, `\`${a.of}\``, a.form, a.groupFiles, a.selected, a.fidelity.toFixed(2), a.viable ? 'yes' : 'no',
      touching ? `${m.importsInside}/${touching}` : 'none either way', `${m.mined ?? 0}/${m.files ?? 0}`, m.rules ?? 0, a.why];
  };
  const LEVEL_NOTE = {
    domain: 'A role group whose members all live under one directory below their host (ticket 116). Its `when` is a path glob, so a file added to that directory joins the type by itself — this is the only alternatives level that generalises on the layout alone.',
    'role group': 'A structurally-uniform cluster inside a partition that is NOT a place in the layout. It can only be a `content:` predicate (which generalises, and may over- or under-select) or a frozen list of paths (exact today, and it will classify no file grain has not already seen). Two types over one directory separated by `content:` have no ordering between them, which is why this level is never activated.',
    directory: 'A directory that carries declarations grain parsed — usually a published directory card — that this run did not promote to a type of its own.',
  };
  for (const level of TYPE_LEVELS) {
    const rows = alternatives.filter(a => a.level === level);
    if (!rows.length) continue;
    L.push(`## Level: ${level} (${rows.length})`, '', ...(LEVEL_NOTE[level] ? [LEVEL_NOTE[level], ''] : []), mdTable(head, rows.map(row)), '');
  }
  const rest = alternatives.filter(a => !TYPE_LEVELS.includes(a.level));
  if (rest.length) L.push(`## Level: other (${rest.length})`, '', mdTable(head, rest.map(row)), '');
  L.push('## The drafted predicates', '');
  for (const a of alternatives) L.push(`### \`${a.id}\``, '', '```yaml', yamlEmit({ when: a.when }).trimEnd(), '```', '', `Level: ${a.level}. ${a.why}`, '');
  return L.join('\n') + '\n';
}
function renderBacklogMd({ exp, sub, rels, nodeCycles }) {
  const L = ['# Refactor backlog', '', ...PREAMBLE, '', '---', '',
    'This is not part of the graph. It is the list of places where the repository disagrees with itself, ranked',
    'by how much of it already agrees. Every row is a decision: spread the rule, or drop it.', ''];

  const convs = (exp.conventions || []).filter(c => (c.deviatingSites || []).length).map(c => {
    const n = c.established || 0, d = (c.deviatingSites || []).length;
    return { c, n, d, adoption: n / Math.max(1, n + d) };
  }).sort((a, b) => b.d - a.d);
  L.push(`## 1. Certified conventions with sites that do not follow them (${convs.length})`, '',
    mdTable(['adoption', 'conforming', 'deviating', 'partition', 'rule'],
      convs.map(x => [pct(x.adoption), x.n, x.d, `\`${x.c.partition}\``, x.c.statement])), '');
  for (const x of convs.slice(0, 12)) {
    L.push(`### ${x.c.statement}`, '', `${pct(x.adoption)} adoption — ${x.d} sites to change:`, '');
    for (const d of x.c.deviatingSites.slice(0, 25)) L.push(`- \`${d.rel}\`${d.name ? ` — \`${d.name}\`` : ''} (${d.phrase || 'deviates'})`);
    if (x.c.deviatingSites.length > 25) L.push(`- … and ${x.c.deviatingSites.length - 25} more`);
    L.push('');
  }

  L.push(`## 2. Candidate house rules below grain's gate (${sub.length})`, '',
    'Practised by a supermajority but not yet by enough of the code for grain to state it as a fact. This is the',
    'sub-gate lattice — the surface `grain explain` shows one file at a time, aggregated per partition.', '',
    // A `false`-direction row of an absence class is listed as what it is (ticket 115). Printed in this table's
    // own idiom it read `files never import X` with `8 sites to fix` beside it — an instruction to delete the
    // eight imports, on evidence that says only that most files here do not have one.
    mdTable(['adoption', 'n', 'partition', 'scope', 'candidate rule', 'sites to fix'],
      sub.slice(0, 80).map(r => [pct(r.share), r.n, `\`${r.partition}\``, r.role !== null ? `role r${r.role}` : 'partition',
        isAbsenceRow(r)
          ? `${r.ne} of ${r.n} ${r.kind}s do not ${describeRow(r.pid, r.exp)} — an absence, not a rule`
          : `${r.kind}s ${describeRow(r.pid, r.exp)}`,
        isAbsenceRow(r) ? '—' : r.deviants.length])), '');

  const twins = (exp.twins || []).filter(t => t.namedDifferently);
  L.push(`## 3. Structural twins — one shape under two names (${twins.length} of ${(exp.twins || []).length} twin pairs are named differently)`, '',
    mdTable(['similarity', 'a', 'b', 'named differently'],
      twins.slice(0, 40).map(t => [t.sim.toFixed(2), `\`${t.a.part}\` ${t.a.label}`, `\`${t.b.part}\` ${t.b.label}`, (t.namedDifferently || []).join(' vs ')])), '');

  const cyc = exp.moduleGraph?.cycles || [];
  L.push(`## 4. Dependency cycles — ${cyc.length} in grain's module graph, ${nodeCycles.length} in the proposed node graph`, '',
    '**THIS IS WHY THE PROPOSAL IS RED.** Yggdrasil refuses a graph whose node relations form a loop',
    '(`structural-cycle`, a blocking error), and the proposal declares every dependency the code contains. Until',
    'a loop below is broken in the CODE — extract a shared interface, invert a dependency, or merge the nodes —',
    'no honest graph over this repository can be green. Cutting the edge out of the proposal instead was tried',
    'and measured: it turned one error that names the real defect into four that ask for the edge back.', '');
  for (const c of cyc) L.push(`- grain's own module cycle: ${c.map(x => `\`${x}\``).join(' → ')} → …`);
  L.push('', mdTable(['weakest edge in the loop', 'resolved imports', 'the loop'],
    nodeCycles.map(d => [`\`${d.from}\` → \`${d.to}\``, d.n, d.cycle.map(x => `\`${x}\``).join(' → ')])), '');

  L.push('## 5. Established negatives that are NOT proposed as `deny`', '',
    'Grain measured that these pairs do not happen. An architecture `deny` says a pair is NOT PERMITTED — a',
    'different statement. Where the code contains an import that a deny would forbid, the negative stays here as',
    'a question for you rather than becoming a rule that contradicts the code. In the three-class vocabulary of',
    'the reconstruction report this is class (c): undecidable without a human.', '',
    mdTable(['from', 'to', 'share', 'why it is not a deny'], rels.backlog.map(d => [`\`${d.from}\``, `\`${d.to}\``, d.share.toFixed(3), d.whyNot])), '');
  return L.join('\n') + '\n';
}
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

// ===== the seams already split out of this file =====
// proposal writer · the admission constants, the Yggdrasil CLI resolution, the file walk and the YAML emitter
export {
  SUPERMAJORITY,
  LAMBDA_BOUND,
  MIN_SUPPORT,
  MIN_PROMOTE_FILES,
  MIN_GROUP_MEMBERS,
  MIN_WHEN_FIDELITY,
  MIN_CONVENTION_SITES,
  FAMILY_MIN_MEMBERS,
  SUBGATE_PER_PARTITION,
  resolveYg,
  progressiveReference,
  slug,
  yq,
  yamlEmit,
  PREAMBLE,
} from './propose-base.mjs';
// proposal writer · candidate localities and the words that describe a level
export {
  localities,
  TYPE_LEVELS,
  typeEvidence,
  evidenceContext,
  levelSentence,
  contentRegexFor,
  caseTolerant,
} from './propose-levels.mjs';
// proposal writer · node_types — choosing the level a type is cut at
export { buildTypes } from './propose-types.mjs';
// proposal writer · relations and the coarse node cut
export { buildRelations, nodePathFor, typeGlob, nestedProjectRoots, buildNodes } from './propose-nodes.mjs';
// proposal writer · the sub-gate lattice and the identifiers a rule is written in
export {
  partitionLattice,
  subGate,
  identifierOf,
  shapeToRegex,
  DRAFT_NOTE,
  statusNote,
} from './propose-lattice.mjs';
// proposal writer · the deterministic check.mjs a drafted aspect ships
export { renderCheck } from './propose-checks.mjs';
// proposal writer · which lattice rows are renderable, which direction they hold in, and why
export { RENDERABLE, isAbsenceRow, renderableDirection, WHY_PROSE } from './propose-classify.mjs';
// proposal writer · sizing.json — what the graph costs to review
export { computeSizing } from './propose-sizing.mjs';
// proposal writer · the obligation form and the aspect drafts
export {
  unitOne,
  obligationSentence,
  obligationOfStatement,
  describeRow,
  buildAspects,
} from './propose-aspects.mjs';
// proposal writer · provenance, and the status an aspect earns from a real drill
export {
  provenanceFor,
  SLOWEST_OBSERVED_DRILL_MS,
  DRILL_TIMEOUT_MS,
  promoteEnforceableAspects,
} from './propose-status.mjs';
// proposal writer · the family-without-law adapter and node co-change
export { buildFamilyCandidates, nodeCochangePairs } from './propose-family.mjs';
// proposal writer · the drill corpora and the aspect bodies they accompany
export { cutDrills } from './propose-drills.mjs';
