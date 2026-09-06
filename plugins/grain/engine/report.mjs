// grain engine · report, rules, status and the structural map
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { CFG } from './config.mjs';
import { baselineClause, practicedBy } from './cards.mjs';
import { archCellLabel, factLabel, pct, ptr, scopeLabel } from './facts.mjs';
import { authorConcClause, skipLineNote, voice } from './mine.mjs';
import {
  CYCLE_GRANULARITY_NOTE,
  DIRTY_TREE_NOTE,
  TEMPLATE_DESCRIPTIVE_NOTE,
  factTiers,
  healthRows,
  intraModuleNote,
  relCoverageNote,
} from './report-facts.mjs';
import { verbalize } from './verbalize.mjs';
import { heritageKindOf } from './weights.mjs';

export function report(model, { top = 15, outcomes } = {}) {
  const lines = [];
  for (const p of model.partitions) {
    lines.push(
      `== ${scopeLabel(p.name)} — ${p.facts.length} conventions · ${p.medoids.length} groups · ${p.scopes} scopes · ${p.files.length} files ==`
    );
    const { domain, structural, lexical, taut } = factTiers(p);
    const printFact = f => {
      const t = f.trend;
      const tr = t
        ? ` trend[${t.shares.map(s => pct(s.share)).join('>')}%]${t.nucleating ? ` — a newer pattern is emerging here: ${t.nucleating}` : ''}`
        : '';
      lines.push(
        `  ${voice(
          'practiced',
          `${factLabel(p, f)}: ${verbalize(
            f,
            f.exemplars.map(e => e.name)
          )} — ${pct(f.share)}% of ${f.sraw} established${f.deviantsN ? `, ${f.deviantsN} deviant${f.deviantsN > 1 ? 's' : ''}` : ''}${tr}${f.held && f.held.since ? ` · held since ${f.held.since}` : ''}${f.authorConc ? ` · ${authorConcClause(f.authorConc)}` : ''}`
        )}`
      );
    };
    for (const f of domain.slice(0, top)) printFact(f);
    if (domain.length > top)
      lines.push(`  … and ${domain.length - top} more — run with --top ${domain.length} for all`);
    if (structural.length) {
      lines.push('  syntax-shape facts (structural, not a chosen convention):');
      for (const f of structural.slice(0, top)) printFact(f);
      if (structural.length > top)
        lines.push(`  … and ${structural.length - top} more — run with --top ${structural.length} for all`);
    }
    if (lexical.length) {
      lines.push('  style conventions (quotes, semicolons, indentation, declarations):');
      for (const f of lexical.slice(0, top)) printFact(f);
      if (lexical.length > top)
        lines.push(`  … and ${lexical.length - top} more — run with --top ${lexical.length} for all`);
    }
    if (taut)
      lines.push(
        `  (${taut} group-defining marker${taut > 1 ? 's' : ''} not listed — a group selected by its decorator/supertype restating it is not news; \`where\` still uses them)`
      );
    for (const t of (p.templates || []).slice(0, 6)) {
      const bits = [];
      for (const pi of t.perInstance)
        bits.push(`one slot per-instance (${pi.distinct}/${pi.total}, e.g. \`${pi.top}\`)`);
      for (const sl of t.slots) bits.push(`slot usually \`${sl.top}\` (${sl.k}/${sl.total})`);
      lines.push(
        `  template (unclustered ${t.kind}s ×${t.n}, ~${Math.round(t.coverage * 100)}% of an average one): ${t.skel}${bits.length ? ' · ' + bits.join(' · ') : ''}${t.held ? ` · held since ${t.held.since}${t.held.fresh ? ` · ${t.held.fresh} new in 180d` : ''}` : ''} · ${TEMPLATE_DESCRIPTIVE_NOTE} — e.g. ${ptr(t.exemplars[0].rel, t.exemplars[0].line, t.exemplars[0].endLine)}`
      );
    }
  }
  if (model.moduleGraph && model.moduleGraph.nodes.length > 1) {
    const mg = model.moduleGraph;
    lines.push(
      `== architecture — ${mg.nodes.length} modules · ${mg.edges.length} directed dependencies · ${mg.cycles.length} cycle(s) ==`
    );
    const covNote = relCoverageNote(model);
    if (covNote) lines.push(`  ${covNote}`);
    const intraNote = intraModuleNote(model);
    if (intraNote) lines.push(`  ${intraNote}`);
    const out = new Map();
    for (const e of mg.edges) (out.get(e.from) || out.set(e.from, []).get(e.from)).push(e);
    for (const [from, es] of [...out]
      .sort((a, b) => b[1].reduce((x, y) => x + y.n, 0) - a[1].reduce((x, y) => x + y.n, 0))
      .slice(0, 12))
      lines.push(
        `  ${from}/ → ${es
          .slice(0, 5)
          .map(e => `${e.to}/ (${e.n})`)
          .join(' · ')}${es.length > 5 ? ` · +${es.length - 5} more` : ''}`
      );
    for (const c of mg.cycles.slice(0, 4))
      lines.push(
        `  cycle (strongly connected): ${c.join(', ')} — every member reaches every other, not necessarily in this order`
      );
    if (mg.cycles.length) lines.push(`  ${CYCLE_GRANULARITY_NOTE}`);
    const departures = (model.archNorms || []).filter(n => n.exp === 'false' && n.fromKind !== 'group'); // "module pair(s)" below is a claim about modules specifically — group-kind rows have their own home in computeArchHits, not this count
    if (departures.length)
      lines.push(
        `  established layering: ${departures.length} module pair(s) where reaching the target is the counted exception, not the practice`
      );
  }
  {
    const moving = [];
    for (const p2 of model.partitions)
      for (const f of p2.facts) {
        if (!f.trend || !f.trend.shares || f.trend.shares.length < 2) continue;
        const a = f.trend.shares[0].share,
          b2 = f.trend.shares[f.trend.shares.length - 1].share;
        if (Math.abs(b2 - a) >= 0.1 || f.suppressedValue) moving.push({ p: p2, f, d: b2 - a });
      }
    if (moving.length) {
      lines.push(`== drift — ${moving.length} convention(s) in motion ==`);
      for (const m of moving.sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 10))
        lines.push(
          `  ${m.d > 0 ? '↑' : m.d < 0 ? '↓' : '~'} ${factLabel(m.p, m.f)}: ${verbalize(
            m.f,
            m.f.exemplars.map(e => e.name)
          )} — ${m.f.trend.shares.map(x2 => pct(x2.share)).join('>')}%${m.f.suppressedValue ? ` · a newer pattern is emerging: ${m.f.suppressedValue}` : ''}`
        );
    }
  }
  // the recurring shapes of past changes (§J4.1): what a change of this kind touches here, with the population it
  // was measured over. Deliberately colon-free — every `<marker>: ` prefix grain prints is a voice, and this is a
  // practiced claim, which has no marker of its own (§J0.1).
  if (model.changeArchetypes && model.changeArchetypes.length) {
    lines.push(
      `== changes — ${model.changeArchetypes.length} shape${model.changeArchetypes.length > 1 ? 's' : ''} ==`
    );
    for (const a of model.changeArchetypes) {
      const cs = a.cells.filter(c => c.certified);
      lines.push(
        `  ${voice(
          'practiced',
          `"${a.label}" — ${a.n} changes · ${cs
            .slice(0, 6)
            .map(c => `${archCellLabel(model, c.cell)} (${c.k} of ${a.n})`)
            .join(' · ')}${cs.length > 6 ? ` · +${cs.length - 6} more` : ''}`
        )}`
      );
    }
  }
  if (model.boundaries && model.boundaries.length) {
    lines.push(
      `== boundaries — ${model.boundaries.length} architecture decision(s) in .grain/seeds.jsonl ==`
    );
    for (const bd of model.boundaries)
      lines.push(
        `  ${voice('decided', `${bd.boundary.from}/ never imports ${bd.boundary.to}/${bd.note ? ' — ' + bd.note : ''}${!bd.fromLive || !bd.toLive ? ' (a side names no indexed files — inert)' : ''}`, { typ: 'boundary', who: bd.author, when: bd.createdAt, id: bd.id })}`
      );
  }
  if (model.steers && model.steers.length) {
    lines.push(`== steers — ${model.steers.length} maintainer decision(s) in .grain/seeds.jsonl ==`);
    for (const st of model.steers) {
      if (!st.found) {
        lines.push(
          `  ${st.id}: exemplar ${st.path}#${st.name} not found in HEAD — inert (edit or remove it)`
        );
        continue;
      }
      for (const sf of st.surfaces) {
        if (sf.retires) continue;
        lines.push(
          `  ${voice('decided', `${sf.value === null ? `${sf.pid} is not a surface of ${st.name}` : verbalize({ pid: sf.pid, exp: sf.value, kind: st.kind, heritageKind: heritageKindOf(sf.pid, model) }, [st.name]) + ' — ' + practicedBy(sf) + baselineClause(sf)} · weight ${st.weight}${st.note ? ' · ' + st.note : ''}`, { typ: 'steer', who: st.author, when: st.createdAt, id: st.id })}`
        );
        for (const rp of st.surfaces.filter(x => x.retires))
          lines.push(
            `    retires: ${verbalize({ pid: rp.pid, exp: 'true', kind: st.kind, heritageKind: heritageKindOf(rp.pid, model) }, [])}`
          );
      }
    }
  }
  if (model.waivers && model.waivers.length) {
    lines.push(`== waivers — ${model.waivers.length} waiver(s) in .grain/seeds.jsonl ==`);
    for (const wv of model.waivers) {
      if (!wv.found) {
        lines.push(`  ${wv.id}: scope ${wv.path}#${wv.name} not found in HEAD — inert (edit or remove it)`);
        continue;
      }
      lines.push(
        `  ${voice('decided', `${wv.path}#${wv.name} (line ${wv.line}) is excused from ${wv.pid}${wv.note ? ' — ' + wv.note : ''}`, { typ: 'waiver', who: wv.author, when: wv.createdAt, id: wv.id })}`
      );
    }
  }
  {
    const health = healthRows(model, outcomes);
    if (health.length) {
      lines.push(`== health — ${health.length} signal${health.length > 1 ? 's' : ''} ==`);
      for (const h of health) lines.push(`  ${voice('practiced', h)}`);
    }
  }
  lines.push(
    `agent-authored share of code younger than ${CFG.survDays} days: ${model.agentShare == null ? 'n/a' : Math.round(model.agentShare * 100) + '%'} · co-change pairs: ${model.cochange.length} (bulk commits touching >30 files excluded from pairing)`
  );
  return lines;
}
// `grain map`'s full-detail structural overview (§J4.3a layers/decisions, §J4.3b concepts/changes — named
// `mapSections`, not `mapLines`, since `howCmd` already binds a local `mapLines` of its own). `layers:`/`concepts:`
// are map-voice structural claims, per this file's own voice() definition above. `changes:` is practiced — the
// same voice report()'s own `== changes ==` section uses for the identical `model.changeArchetypes` data — capped
// to the top 4 by `n` (already the model's own sort order) since this overview is meant to be scannable, not a
// full dump (that's what `report`'s `== changes — N shapes ==` section is for). The ticket's own example text also
// wanted a trailing `e.g. <sha>` citation; that citation is deliberately dropped here rather than kept unmarked or
// wrapped in its own `voice('example', ...)` fragment — a per-archetype citation adds another number to parse in a
// line whose whole point is to be skimmed, and `report`'s detailed section already exists for exactly that
// evidence. `decisions:` is a bare count/structure line (like a header or a stamp), never a claim, so it carries
// no voice() marker at all.
// the module→layer grouping `map`'s text `layers:` line renders (byLayer, below) — extracted so a second caller
// (ticket 072: `report --json`'s `layers` field) computes the identical grouping instead of re-deriving its own,
// the same "one function computes it" discipline as relCoverageData/relCoverageNote above (§G21). Returns the
// FULL, untruncated module list per layer, ascending by layer number, modules sorted alphabetically within — the
// same sort mapSections' own `mods.sort()` already used; mapSections' 4-per-layer "+K more" cap is a display
// concern layered on top by its own caller, exactly like cmdMap's `changes` field already keeps the full
// `model.changeArchetypes` list while its OWN text line caps to 4 (§066/051).
export function moduleLayers(model) {
  const mg = model.moduleGraph;
  if (!mg || !mg.nodes.length) return [];
  const byLayer = new Map();
  for (const n of mg.nodes) {
    if (n.layer === undefined) continue;
    (byLayer.get(n.layer) || byLayer.set(n.layer, []).get(n.layer)).push(n.id);
  }
  return [...byLayer.keys()]
    .sort((a, b) => a - b)
    .map(l => ({ layer: l, modules: byLayer.get(l).sort() }));
}
export function mapSections(model) {
  const lines = [];
  const mg = model.moduleGraph;
  if (mg && mg.nodes.length) {
    const label = id => (id === '.' ? '.' : id + '/');
    const segs = moduleLayers(model).map(({ layer: l, modules: mods }) => {
      return `layer ${l}${l === 0 ? ' (leaves)' : ''}: ${mods.slice(0, 4).map(label).join(', ')}${mods.length > 4 ? `, +${mods.length - 4} more` : ''}`;
    });
    if (segs.length) lines.push(voice('map', `layers: ${segs.join(' · ')}`));
  }
  if (model.concepts && model.concepts.length)
    lines.push(voice('map', `concepts: ${model.concepts.join(', ')}`));
  if (model.changeArchetypes && model.changeArchetypes.length) {
    const cs = model.changeArchetypes;
    const segs2 = cs.slice(0, 4).map(a => `"${a.label}" — ${a.n} change${a.n === 1 ? '' : 's'}`);
    lines.push(
      voice('practiced', `changes: ${segs2.join(' · ')}${cs.length > 4 ? ` · +${cs.length - 4} more` : ''}`)
    );
  }
  const decisionsN =
    (model.steers || []).length + (model.boundaries || []).length + (model.waivers || []).length;
  lines.push(`decisions: ${decisionsN} maintainer decision(s) in force`);
  return lines;
}
// a standalone Markdown document over the SAME model data report() renders, for a reader (human or tool) with no
// terminal and no grain plugin installed — a snapshot stamped with the commit it was computed from, not a live
// query. Reuses report()'s own tier split and verbalization helpers (factTiers, factLabel, verbalize,
// authorConcClause, practicedBy, baselineClause) so the two renderers can never disagree about what a convention
// is; a table (not report's flat bullets) fits a static reference document better, with room for an exemplar
// path+line column a terse CLI line has no space for. Excludes report()'s `== drift ==` section on purpose: drift
// is a "how is this changing" trend view suited to a live query, not a "what to copy right now" reference.
export function rulesMarkdown(
  model,
  { top = 15, sha = 'no-git', date = new Date().toISOString().slice(0, 10), outcomes, dirty = false } = {}
) {
  const lines = [];
  lines.push(`# ${model.repo} — established conventions`, '');
  lines.push(
    `Generated by \`grain rules\` as of commit \`${sha}\` on ${date} — this file is a snapshot, not a live query; recompute with \`grain rules --out <this file>\` after the code moves. It reflects only what a maintainer would see running \`grain report\` on this exact commit.`,
    ''
  );
  const row = (p, f) => {
    const t = f.trend;
    const tr = t
      ? `trend ${t.shares.map(s => pct(s.share)).join('>')}%${t.nucleating ? ` — newer pattern emerging: ${t.nucleating}` : ''}`
      : '';
    const notes = [
      tr,
      f.held && f.held.since ? `held since ${f.held.since}` : '',
      f.authorConc ? authorConcClause(f.authorConc) : '',
    ]
      .filter(Boolean)
      .join('; ');
    const ex = f.exemplars[0];
    const evidence = `${pct(f.share)}% of ${f.sraw} established${f.deviantsN ? `, ${f.deviantsN} deviant${f.deviantsN > 1 ? 's' : ''}` : ''}`;
    return `| ${factLabel(p, f)} | ${voice(
      'practiced',
      verbalize(
        f,
        f.exemplars.map(e => e.name)
      )
    )} | ${evidence} | ${ex ? `\`${ptr(ex.rel, ex.line, ex.endLine)}\`${skipLineNote(p, f, ex)}` : ''} | ${notes} |`;
  };
  const table = (p, heading, facts) => {
    if (!facts.length) return;
    lines.push(
      `### ${heading}`,
      '',
      '| where | convention | evidence | exemplar | notes |',
      '| --- | --- | --- | --- | --- |'
    );
    for (const f of facts.slice(0, top)) lines.push(row(p, f));
    if (facts.length > top)
      lines.push(
        '',
        `_… and ${facts.length - top} more — run \`grain rules --top ${facts.length}\` for all_`
      );
    lines.push('');
  };
  for (const p of model.partitions) {
    const { domain, structural, lexical, taut } = factTiers(p);
    lines.push(
      `## ${scopeLabel(p.name)}`,
      '',
      `${p.facts.length} conventions · ${p.medoids.length} groups · ${p.scopes} scopes · ${p.files.length} files`,
      ''
    );
    table(p, 'Domain conventions', domain);
    table(p, 'Syntax-shape facts (structural, not a chosen convention)', structural);
    table(p, 'Style conventions', lexical);
    if (taut)
      lines.push(
        `_${taut} group-defining marker${taut > 1 ? 's' : ''} not listed — a group selected by its decorator/supertype restating it is not news._`,
        ''
      );
    if ((p.templates || []).length) {
      lines.push('### Templates (unclustered residue)', '');
      for (const t of p.templates.slice(0, 6)) {
        const bits = [];
        for (const pi of t.perInstance)
          bits.push(`one slot per-instance (${pi.distinct}/${pi.total}, e.g. \`${pi.top}\`)`);
        for (const sl of t.slots) bits.push(`slot usually \`${sl.top}\` (${sl.k}/${sl.total})`);
        lines.push(
          `- \`${t.skel}\` — unclustered ${t.kind}s ×${t.n}, ~${Math.round(t.coverage * 100)}% of an average one${bits.length ? ' · ' + bits.join(' · ') : ''}${t.held ? ` · held since ${t.held.since}${t.held.fresh ? ` · ${t.held.fresh} new in 180d` : ''}` : ''} · ${TEMPLATE_DESCRIPTIVE_NOTE} — e.g. \`${ptr(t.exemplars[0].rel, t.exemplars[0].line, t.exemplars[0].endLine)}\``
        );
      }
      lines.push('');
    }
  }
  if (model.moduleGraph && model.moduleGraph.nodes.length > 1) {
    const mg = model.moduleGraph;
    lines.push(
      '## Architecture',
      '',
      `${mg.nodes.length} modules · ${mg.edges.length} directed dependencies · ${mg.cycles.length} cycle(s)`,
      ''
    );
    // the same two coverage disclosures report()'s architecture section carries (§G21, §004) — rendered as their
    // own paragraph(s), not report()'s 2-space indent, to match this document's own Markdown idiom
    const covNote = relCoverageNote(model);
    if (covNote) lines.push(covNote, '');
    const intraNote = intraModuleNote(model);
    if (intraNote) lines.push(intraNote, '');
    const out = new Map();
    for (const e of mg.edges) (out.get(e.from) || out.set(e.from, []).get(e.from)).push(e);
    for (const [from, es] of [...out]
      .sort((a, b) => b[1].reduce((x, y) => x + y.n, 0) - a[1].reduce((x, y) => x + y.n, 0))
      .slice(0, 12))
      lines.push(
        `- \`${from}/\` → ${es
          .slice(0, 5)
          .map(e => `\`${e.to}/\` (${e.n})`)
          .join(' · ')}${es.length > 5 ? ` · +${es.length - 5} more` : ''}`
      );
    if (mg.cycles.length) {
      lines.push(
        '',
        '**Cycles (strongly connected — every member reaches every other, not necessarily in this order):**',
        ''
      );
      for (const c of mg.cycles.slice(0, 4)) lines.push(`- ${c.join(', ')}`);
      lines.push('', CYCLE_GRANULARITY_NOTE);
    }
    const departures = (model.archNorms || []).filter(n => n.exp === 'false' && n.fromKind !== 'group'); // "module pair(s)" below is a claim about modules specifically — group-kind rows have their own home in computeArchHits, not this count
    if (departures.length)
      lines.push(
        '',
        `_Established layering: ${departures.length} module pair(s) where reaching the target is the counted exception, not the practice._`
      );
    lines.push('');
  }
  if (model.boundaries && model.boundaries.length) {
    lines.push(
      '## Boundaries',
      '',
      `${model.boundaries.length} architecture decision(s) in \`.grain/seeds.jsonl\``,
      ''
    );
    for (const bd of model.boundaries)
      lines.push(
        `- ${voice('decided', `\`${bd.boundary.from}/\` never imports \`${bd.boundary.to}/\`${bd.note ? ' — ' + bd.note : ''}${!bd.fromLive || !bd.toLive ? ' (a side names no indexed files — inert)' : ''}`, { typ: 'boundary', who: bd.author, when: bd.createdAt, id: bd.id })}`
      );
    lines.push('');
  }
  if (model.steers && model.steers.length) {
    lines.push(
      '## Maintainer decisions (steers)',
      '',
      `${model.steers.length} maintainer decision(s) in \`.grain/seeds.jsonl\``,
      ''
    );
    for (const st of model.steers) {
      if (!st.found) {
        lines.push(
          `- **${st.id}**: exemplar ${st.path}#${st.name} not found in HEAD — inert (edit or remove it)`
        );
        continue;
      }
      for (const sf of st.surfaces) {
        if (sf.retires) continue;
        lines.push(
          `- ${voice('decided', `${sf.value === null ? `${sf.pid} is not a surface of ${st.name}` : verbalize({ pid: sf.pid, exp: sf.value, kind: st.kind, heritageKind: heritageKindOf(sf.pid, model) }, [st.name]) + ' — ' + practicedBy(sf) + baselineClause(sf)} · weight ${st.weight}${st.note ? ' · ' + st.note : ''}`, { typ: 'steer', who: st.author, when: st.createdAt, id: st.id })}`
        );
        for (const rp of st.surfaces.filter(x => x.retires))
          lines.push(
            `  - retires: ${verbalize({ pid: rp.pid, exp: 'true', kind: st.kind, heritageKind: heritageKindOf(rp.pid, model) }, [])}`
          );
      }
    }
    lines.push('');
  }
  {
    const health = healthRows(model, outcomes);
    if (health.length) {
      lines.push(
        '## Health',
        '',
        `${health.length} signal${health.length > 1 ? 's' : ''} worth a maintainer decision`,
        ''
      );
      for (const h of health) lines.push(`- ${voice('practiced', h)}`);
      lines.push('');
    }
  }
  while (lines.length && lines[lines.length - 1] === '') lines.pop();
  lines.push('', `*as of ${sha}*`); // frozen snapshot-time fact, deliberately part of the document (unlike the CLI's own ephemeral stamp() line — see cmdRules, grain.mjs)
  // (§024c) same snapshot-time-fact reasoning as the sha/date above: whether the generating worktree was dirty is
  // itself worth persisting alongside them, not just echoed on the CLI. `rules` is a HEAD-reader — `dirty` here is
  // never `+dirty`, only this distinct disclosure (see DIRTY_TREE_NOTE above).
  if (dirty) lines.push('', `*${DIRTY_TREE_NOTE}*`);
  return lines;
}
export function statusLines(model) {
  const nf = model.partitions.reduce((a, p) => a + p.facts.length, 0);
  const ng = model.partitions.reduce((a, p) => a + p.medoids.length, 0);
  const covNote = relCoverageNote(model);
  return [
    `model: ${model.repo} · ${model.partitions.length} partition(s) · ${ng} groups · ${nf} conventions · ${model.files} files${!model.historyStats ? ' — no git history: nothing counts as established, so no convention is spoken (groups and placement still answer `where`)' : ''}`,
    `agent-authored share of code younger than ${CFG.survDays} days: ${model.agentShare == null ? 'n/a (no history)' : Math.round(model.agentShare * 100) + '%'}${model.agentShare >= 0.85 ? ' ⚠ ALARM — the norm is being written by agents faster than humans review it' : ''}`,
    `nucleating stand-downs: ${model.partitions.reduce((a, p) => a + p.facts.filter(f => f.suppressedValue).length, 0)}`,
    // (§034a) "non-merge": walk() (history.mjs) runs `git log --no-merges` — a merge introduces no blob of its own,
    // so it never enters this count. Left unqualified, this number reads as `git log --oneline | wc -l` and looks
    // like lost history on any repo with real merge traffic (confirmed: nest reports 12,435 here against 21,710 in
    // plain `git log`). CFG.megaCap/nonMegaCommits (§J2.4b) are a SEPARATE, narrower accounting for the language
    // bridge's own base-rate denominator — they do not touch this total, which is exactly `commits.length` off the
    // `--no-merges` walk.
    `co-change pairs: ${model.cochange.length} · history: ${model.historyStats ? model.historyStats.commits + ' non-merge commits, ' + model.historyStats.blobs + ' blobs' : 'none (degraded weights)'}`,
    `architecture: ${model.moduleGraph?.nodes.length ?? 0} modules · ${(model.edges || []).length} file edges${model.edgesTruncated ? ' (+' + model.edgesTruncated + ' truncated)' : ''} · ${model.moduleGraph?.edges.length ?? 0} module edges · ${model.moduleGraph?.cycles.length ?? 0} cycle(s)`,
    ...(covNote ? [covNote] : []),
    ...(model.steers && model.steers.length
      ? [
          `steers: ${model.steers.filter(s => s.found).length} active${model.steers.some(s => !s.found) ? `, ${model.steers.filter(s => !s.found).length} inert (exemplar gone)` : ''} — .grain/seeds.jsonl`,
        ]
      : []),
    ...(model.boundaries && model.boundaries.length
      ? [`boundaries: ${model.boundaries.length} architecture decision(s) — .grain/seeds.jsonl`]
      : []),
  ];
}
