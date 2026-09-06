// grain engine · proposal writer · PROPOSAL.md, alternatives.md and the refactor backlog
// Split out of propose.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { describeRow } from './propose-aspects.mjs';
import { PREAMBLE, pct, yamlEmit } from './propose-base.mjs';
import { isAbsenceRow } from './propose-classify.mjs';
import { mdTable } from './propose-drills.mjs';
import { TYPE_LEVELS } from './propose-levels.mjs';

export function renderProposalMd({ repo, exp, files, active, alternatives, nodes, aspects, rels, sub, lat, counts, typesWithNoLaw = [] }) {
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
export function renderAlternativesMd({ alternatives }) {
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
export function renderBacklogMd({ exp, sub, rels, nodeCycles }) {
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
