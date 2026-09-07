// grain engine · completeness, scope and file co-change, recipes, value-kin gaps and the missing lines
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { basename } from 'node:path/posix';
import { CFG } from './config.mjs';
import { refineModOf } from './relations.mjs';
import { stem0 } from './extract.mjs';
import { archCellLabel, clearsOwnRate, jacW, pct, scopeLabel } from './facts.mjs';
import { assignAll, mine, voice } from './mine.mjs';
import { ambientLines } from './obligations.mjs';
import { partitionFor } from './partition.mjs';
import { sufOf } from './placement.mjs';

export function completeness(model, changed) {
  const exp = new Set();
  for (const c of model.cochange)
    for (const f of changed) {
      if (c.a === f && !changed.includes(c.b)) exp.add(`${c.b} (co-changed ${c.sup}x, conf ${c.conf})`);
      if (c.b === f && !changed.includes(c.a)) exp.add(`${c.a} (co-changed ${c.sup}x, conf ${c.conf})`);
    }
  return exp.size
    ? [`[grain] Edits like this historically also touch:`, ...[...exp].slice(0, 5).map(x => '  - ' + x)]
    : ['(complete)'];
}
// the same loop `completenessDirectional` has always used, factored out so `missingLines` and `check-hook` can
// read the same DATA `completeness <file>` prints.
// §063: gated/ranked by the MAX of the two directional confidences, never the changed side's own forward
// confidence alone — a heavily-committed hub's own commit count as denominator makes even a near-certain partner
// read as noise (support=8, commitsA=392 -> 0.02) while the partner's OWN base rate (support=8, commitsB=10 ->
// 0.80, "when the partner changes, the hub changes 80% of the time") shows the real signal. A single changed file
// (completeness <file>, check <file>, both hooks) also gets the SAME looser 1/3 floor `cochangePartners`'s own
// single-file mode already uses below ("one file's history is sparse; a third of its commits is a real signal")
// — this function was the one place that floor was deliberately withheld, which is exactly what made
// `completeness` disagree with `where` on the same file (44 of the 45 hottest files in the measured corpus got a
// false "no file historically changes with these" — see .system/research/question-catalog.md §3.2). A multi-file
// `changed` set (`review` over several touched files) keeps the stricter CFG.cochangeMinConf: more files already
// means more corroborating evidence, so the sparse-history case for the looser floor doesn't apply.
// §074: `ambient` on a hit below is structural, not a new tunable — a partner whose OWN global commit count
// (`c.commitsA`/`c.commitsB`, whichever side IS the partner — never the display `commits`, which §063 already
// picks as whichever direction's denominator cleared the confidence bar and so can legitimately be the CHANGED
// file's own count instead) already clears the same λ bound `certifyObligationRules`' ambient gate uses, against
// `model.nonMegaCommits` — the exact population those counts were drawn from (history.mjs). Measured in
// `.system/research/obligations-design.md` §2: pooled over 20 repos, raw co-change recall@3 (0.285) loses to the
// null "3 hottest recently-changed files" (0.336), and the entire deficit is the ambient half — on companions
// outside the 10 hottest files co-change alone scores 0.198 against the null's 0.000. Never merge the two: an
// ambient partner crowds out a specific one at the top of a ranked list an agent has room to read only 3-5 of.
export function cochangeData(model, changed) {
  const hits = new Map();
  // §023: same liveness source and idiom as `cochangePartners`'s own `live` (core.mjs ~2552, added for §020) and
  // `howCmd`'s places[] `exists` flag (~2817) — one house-wide answer to "is this path still here at HEAD", never
  // a second/third liveness check invented per renderer.
  const live = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
  const minConf = changed.length === 1 ? 1 / 3 : CFG.cochangeMinConf;
  const N = model.nonMegaCommits || 0;
  for (const c of model.cochange) {
    const confAB = c.sup / (c.commitsA || 1),
      confBA = c.sup / (c.commitsB || 1);
    if (Math.max(confAB, confBA) < minConf) continue;
    // report the denominator of whichever direction actually cleared the bar — the honest number, not always
    // the changed side's own count (§063: `test/res.attachment.js (8/10)`, not the hub's own `8/392`)
    const commits = confAB >= confBA ? c.commitsA || c.sup : c.commitsB || c.sup;
    for (const f of changed) {
      if (c.a === f && !changed.includes(c.b)) {
        const k = c.commitsB || 0; // the PARTNER's (c.b) own global count — independent of which direction won `commits` above
        hits.set(c.b, clearsOwnRate(k, N)
          ? { file: c.b, sup: c.sup, commits, dead: !live.has(c.b), ambient: true, k, n: N, share: +(k / N).toFixed(3) }
          : { file: c.b, sup: c.sup, commits, dead: !live.has(c.b), ambient: false });
      }
      if (c.b === f && !changed.includes(c.a)) {
        const k = c.commitsA || 0; // the PARTNER's (c.a) own global count
        hits.set(c.a, clearsOwnRate(k, N)
          ? { file: c.a, sup: c.sup, commits, dead: !live.has(c.a), ambient: true, k, n: N, share: +(k / N).toFixed(3) }
          : { file: c.a, sup: c.sup, commits, dead: !live.has(c.a), ambient: false });
      }
    }
  }
  // strongest partner first (confidence, then raw support), file only as the final tiebreak — under the looser
  // single-file floor there can be more than 5 candidates, and slice(0,5) below must keep the best ones, not
  // whichever sort alphabetically first. Ambient hits sort in the same pass (a caller that wants them separated,
  // like `completenessDirectional`, filters by `.ambient` afterward) — this order is never itself rendered as one
  // ranked list.
  return [...hits.values()].sort(
    (a, b) => b.sup / b.commits - a.sup / a.commits || b.sup - a.sup || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)
  );
}
// scope-level co-change for `check <file>` (§J5.7b): the same directional-confidence test cochangeData applies to
// file pairs, over model.scopeCochange's SCOPE-key pairs instead — every pair with a scope in the checked file,
// above CFG.cochangeMinConf. `partitionName` is the checked file's own partition (r.partition): a rendered pair may
// name a scope in a different file/partition, but the line is anchored to the file the caller is looking at.
export function scopeCochangeLines(model, rel, partitionName) {
  const rows = [];
  for (const p of model.scopeCochange || []) {
    const ia = p.a.indexOf('#'),
      ib = p.b.indexOf('#');
    if (ia < 0 || ib < 0) continue;
    const aIn = p.a.slice(0, ia) === rel,
      bIn = p.b.slice(0, ib) === rel;
    if (!aIn && !bIn) continue;
    const commits = aIn ? p.commitsA || 1 : p.commitsB || 1;
    const conf = p.sup / commits;
    if (conf < CFG.cochangeMinConf) continue;
    const aName = p.a.slice(ia + 1).split('#')[1],
      bName = p.b.slice(ib + 1).split('#')[1];
    rows.push({ aName, bName, sup: p.sup, commits, conf });
  }
  rows.sort(
    (x, y) => y.conf - x.conf || (x.aName < y.aName ? -1 : x.aName > y.aName ? 1 : x.bName < y.bName ? -1 : 1)
  );
  const label = partitionName ? scopeLabel(partitionName) : 'this file';
  return rows
    .slice(0, 5)
    .map(r =>
      voice(
        'practiced',
        `co-change (scopes): \`${r.aName}\` ↔ \`${r.bName}\` in ${label} (${r.sup}/${r.commits})`
      )
    );
}
// stable contract: the standalone `completeness <file>` command prints this text verbatim on a SPECIFIC hit — do
// not change it (§023: except the new `(deleted)` marker on a dead partner, which the ticket's own acceptance
// requires — the live-partner case below is byte-for-byte unchanged, so the frozen contract holds for every
// fixture that predates it). The NO-hit case changed under §063: never certify `(complete)` — that phrase claims
// an absence this model cannot actually see (44 of the 45 hottest files in the measured corpus got exactly that
// false claim). Name the threshold that was actually applied instead. §074 adds a SEPARATE ambient section
// (`ambientLines`, shared with `obligationLines`) — never merged into this list: `.system/research/
// obligations-design.md` §2 measured raw co-change losing to the null "3 hottest recent files" pooled (0.285 vs
// 0.336), entirely because the ambient half crowds out the non-obvious half worth reading (0.198 vs 0.000 there).
export function completenessDirectional(model, changed) {
  // ranked by the max of the two directional confidences — see cochangeData's own §063 comment
  const hits = cochangeData(model, changed);
  const specific = hits.filter(h => !h.ambient);
  const ambient = hits.filter(h => h.ambient);
  const minConf = changed.length === 1 ? 1 / 3 : CFG.cochangeMinConf;
  const out = specific.length
    ? [
        `[grain] Edits like this historically also touch:`,
        ...specific
          .slice(0, 5)
          .map(h => `  - ${h.file}${h.dead ? ' (deleted)' : ''} (co-changed in ${h.sup}/${h.commits} commits)`),
      ]
    : [`no partner above ${pct(minConf)}% co-change confidence`];
  return [...out, ...ambientLines(ambient, 5)];
}
// the recipe half of `missingLines`: a NEW file's own carried marker (decorator/supertype/return type) or group role
// borrows exactly the "a new carrier/member comes with" mechanism `whereCmd` already reads off markerImplied/
// groupImplied (core.mjs, buildCards' marker/group cases) — same companion/registration fields, no new heuristic
function recipeLines(kindWord, mi, rel, files, helpers) {
  const { stem0, sufChain, suffixOf } = helpers;
  const lines = [];
  if (mi.companion) {
    const stem = stem0(rel);
    const present = files.some(f => f !== rel && stem0(f) === stem && sufChain(f) === mi.companion.pattern);
    if (!present)
      lines.push(
        voice(
          'practiced',
          `recipe: a new ${kindWord} carrier here usually comes with a same-stem \`${mi.companion.pattern}\` companion (${pct(mi.companion.share)}% of ${mi.companion.n}) — none in the change`
        )
      );
  }
  if (mi.importedBy) {
    if (!files.includes(mi.importedBy.file))
      lines.push(
        voice(
          'practiced',
          `recipe: a new ${kindWord} carrier here is registered in \`${mi.importedBy.file}\` (imports ${mi.importedBy.n} of ${mi.importedBy.of} carriers) — not touched`
        )
      );
  } else if (mi.importedByPattern) {
    const present = files.some(f => suffixOf(f) === mi.importedByPattern.pattern);
    if (!present)
      lines.push(
        voice(
          'practiced',
          `recipe: a new ${kindWord} carrier here is registered by a \`${mi.importedByPattern.pattern}\` file (${mi.importedByPattern.n} of ${mi.importedByPattern.of} carriers) — not touched`
        )
      );
  }
  return lines;
}
// one renderer for "what does my change still miss": co-change partners (from cochangeData, same threshold as
// `completeness`) and, for a genuinely NEW file (one `partitionFor` covers but that carries no history in the
// model yet — `newFileScopes[rel]` is the caller's own already-extracted scopes for it, e.g. `checkFile`'s result
// in `cmdReview`, never re-parsed here), a missing companion/registration recipe for any established marker or
// group role that file's own facts carry. Silent when nothing qualifies — never a "(complete)" placeholder here,
// unlike the standalone single-file `completeness` query above. J3.2's `kin:` and J4.2's `change shape:` sources
// round this out below.
// the raw, string-free lookup behind the "values" half of `kin:` — the certified co-travel norm (model.valueNorms,
// built once in learn()) read back against one changed file's OWN current values. No math here, the same read-only
// split as architectureNorms/computeArchHits. `vals` is the caller's already-extracted file-scope `vals` array
// (missingLines cannot parse: it is synchronous and checkFile is not). Exported because `review --json` reports
// exactly this structure, independently of the rendered lines.
export function valueKinGaps(model, rel, vals, changedSet) {
  const out = [];
  if (!model.valueNorms) return out;
  for (const e of vals || []) {
    const key = e.k + ':' + e.v;
    const N = model.valueNorms[e.c];
    if (!N) continue;
    // a value already in the surviving sibling set is judged against the "near" carriers (exactly one member short),
    // never the whole missing population: a file short of several members at once cannot be blamed for THIS one
    const held = (model.valueSiblings[e.c] || []).includes(key);
    const have = new Set((model.valueIndex[key] || []).map(([r]) => r));
    const gaps = (held ? N.near : N.full).filter(f => !have.has(f) && !changedSet.has(f));
    if (gaps.length)
      out.push({
        value: e.v,
        container: (model.valueContainer || {})[e.c] ?? null,
        gaps,
        bits: N.bits,
        ne: N.ne,
        neff: N.neff,
      });
  }
  return out;
}
export function missingLines(model, files, { sources = [], newFileScopes = {}, changedScopes = {} } = {}) {
  const out = [];
  if (sources.includes('cochange'))
    for (const h of cochangeData(model, files).slice(0, 5))
      out.push(
        voice(
          'practiced',
          `co-change: ${h.file}${h.dead ? ' (deleted)' : ''} (co-changed in ${h.sup}/${h.commits} commits)`
        )
      );
  if (sources.includes('recipe')) {
    const sufChain = rel => {
      const parts = basename(rel).split('.');
      return parts.length >= 2 ? '*.' + parts.slice(1).join('.') : null;
    };
    const suffixOf = rel => {
      const parts = basename(rel).split('.');
      return parts.length >= 3 ? '*.' + parts.slice(-2).join('.') : null;
    };
    const helpers = { stem0, sufChain, suffixOf };
    for (const rel of files) {
      const scopes = newFileScopes[rel];
      if (!scopes || !scopes.length) continue;
      const p = partitionFor(model, rel);
      if (!p) continue;
      const { assign, amb } = assignAll(scopes, p.medoids);
      const seen = new Set();
      scopes.forEach((s, i) => {
        if (s.kind === 'file' || s.kind === 'module') return;
        const mkKeys = [];
        for (const d of s.decos || []) mkKeys.push('deco:' + d);
        if (s.kind === 'type') for (const e of s.sup || []) mkKeys.push('sup:' + e);
        for (const r of s.rets || []) mkKeys.push('ret:' + r);
        for (const mkKey of mkKeys) {
          const key = 'm:' + mkKey;
          if (seen.has(key)) continue;
          seen.add(key);
          const mi = (p.markerImplied || {})[mkKey];
          if (mi) out.push(...recipeLines('marker', mi, rel, files, helpers));
        }
        const role = assign.get(i);
        if (role !== undefined && !amb.has(i)) {
          const key = 'g:' + role;
          if (!seen.has(key)) {
            seen.add(key);
            const gi = (p.groupImplied || {})[role];
            if (gi) out.push(...recipeLines('group', gi, rel, files, helpers));
          }
        }
      });
    }
  }
  // J3.2's `kin:` source, both halves. `changedScopes` covers EVERY successfully parsed file of the change (the
  // values half must speak about an enum that already exists), where `newFileScopes` above covers only genuinely
  // new ones (the stem half, like `recipe:`, is about a new file's missing counterpart). J4.2's `change shape:`
  // source follows it below.
  if (sources.includes('kin')) {
    const changed = new Set(files);
    for (const rel of files) {
      const fsc = (changedScopes[rel] || []).find(s => s.kind === 'file');
      if (!fsc) continue;
      for (const g of valueKinGaps(model, rel, fsc.vals, changed)) {
        const label = g.container ? ` (added to \`${g.container}\`)` : ''; // a positional string container has no name to print
        out.push(
          voice(
            'practiced',
            `kin: \`${g.value}\`${label} — its siblings also appear in: ${g.gaps.join(', ')} — not in your change`
          )
        );
      }
    }
    const rolesInChange = new Map(); // partition name -> every role the WHOLE changed set occupies, committed members and new files alike
    const rolesFor = p => {
      let rs = rolesInChange.get(p.name);
      if (rs) return rs;
      rs = new Set();
      for (const [k, r] of Object.entries(p.assignments || {}))
        if (r !== -1 && changed.has(k.split('#')[0])) rs.add(r);
      for (const f of files) {
        const sc = newFileScopes[f];
        if (!sc || !sc.length) continue;
        const a2 = assignAll(sc, p.medoids);
        a2.assign.forEach((r, i) => {
          if (!a2.amb.has(i)) rs.add(r);
        });
      }
      rolesInChange.set(p.name, rs);
      return rs;
    };
    for (const rel of files) {
      const scopes = newFileScopes[rel];
      if (!scopes || !scopes.length) continue;
      const p = partitionFor(model, rel);
      if (!p || !p.groupKin) continue;
      const { assign, amb } = assignAll(scopes, p.medoids);
      const mine = new Set();
      assign.forEach((r, i) => {
        if (!amb.has(i)) mine.add(r);
      });
      const present = rolesFor(p);
      const said = new Set();
      for (const r of [...mine].sort((a, b) => a - b)) {
        const kin = p.groupKin[r];
        if (!kin || present.has(kin.role) || said.has(kin.role)) continue;
        said.add(kin.role);
        out.push(
          voice(
            'practiced',
            `kin: ${rel} has no «${kin.label}» counterpart (${kin.n} of ${kin.of} members of «${p.medoids[r]?.label || 'group'}» do)`
          )
        );
      }
    }
  }
  // J4.2's `change shape:` source: build the change's own cell-set the SAME way learn() built a commit footprint's
  // (§J4.1) — `m:`/`k:` per file plus `g:` per role the change's own scopes occupy (via `partitionFor`+`assignAll`,
  // same read `kin:`'s role half above uses) — then find the archetype it best matches by `jacW` under the exact
  // membership/ambiguity gate `assignAll` itself uses for a scope and a role medoid (`CFG.minMemb`/`CFG.ambGap`):
  // below the floor, or too close to a second archetype, two shapes would fight over one change, so neither claims
  // it. An archetype's IDENTITY for matching is its WHOLE cell bag (shared cells included), but only its CERTIFIED
  // cells are worth reporting as missing — a complete match to a shape is not a gap, so it says nothing at all.
  if (sources.includes('shape') && (model.changeArchetypes || []).length) {
    const refined =
      model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || [], model.srcRoots || []));
    const changeCells = new Set();
    for (const rel of files) {
      changeCells.add('m:' + refined(rel));
      const sf = sufOf(rel);
      if (sf) changeCells.add('k:' + sf);
      const scopes = changedScopes[rel];
      if (!scopes || !scopes.length) continue;
      const p = partitionFor(model, rel);
      if (!p) continue;
      const { assign, amb } = assignAll(scopes, p.medoids);
      assign.forEach((r, i) => {
        if (!amb.has(i)) changeCells.add('g:' + p.name + '#' + r);
      });
    }
    let best = null,
      m1 = -1,
      m2 = -1;
    for (const a of model.changeArchetypes) {
      const m = jacW(
        changeCells,
        a.cells.map(c => c.cell)
      );
      if (m > m1) {
        m2 = m1;
        m1 = m;
        best = a;
      } else if (m > m2) m2 = m;
    }
    if (best && m1 >= CFG.minMemb && m1 - m2 >= CFG.ambGap) {
      const certified = best.cells.filter(c => c.certified);
      const absent = certified.filter(c => !changeCells.has(c.cell));
      if (absent.length) {
        const touched = certified.length - absent.length;
        out.push(
          voice(
            'practiced',
            `change shape: this change touches ${touched} of ${certified.length} certified cells of "${best.label}" — absent: ${absent.map(c => `${archCellLabel(model, c.cell)} (${c.k} of ${best.n})`).join(', ')}`
          )
        );
      }
    }
  }
  return out.length ? [`missing from your change:`, ...out] : [];
}
