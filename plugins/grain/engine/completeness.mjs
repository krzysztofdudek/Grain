// grain engine · completeness, scope and file co-change, recipes, value-kin gaps and the missing lines
// Split out of core.mjs: the statements below are the ones that stood there, unchanged.
import { basename } from 'node:path/posix';
import { CFG } from './config.mjs';
import { refineModOf } from './relations.mjs';
import { stem0 } from './extract.mjs';
import { archCellLabel, clearsOwnRate, cochangeIdxCost, jacW, partnerBits, pct, scopeLabel } from './facts.mjs';
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
// A partner is named for ONE direction at a time, the edited file's own: of the edited file's commits, the partner
// was touched in `sup`, and that rate must beat the partner's own base rate over the same commit population by the
// co-change cell (`partnerBits`, facts.mjs — the obligation cell's KT/BIC/index-cost contrast; issue 259). The old
// gate took the larger of the two directional confidences against a flat floor (a third for one file, 75% for
// several), so a hub named a test file for the TEST's confidence ("8/10") while the hub's own rate was 8/392, and a
// partner that changes with a third of every commit was named for changing with a third of this file's. Measured
// under the curveball null (validation.md, *False certifications under a null*): the old gate named 6.7 partners a
// run on shuffled Grain history and 191 on Yggdrasil; the contrast names about one. The printed denominator is now
// always the edited file's own commit count.
// `ambient` is structural, not a new tunable — a partner that does not pass the contrast, but whose OWN global
// commit count clears the same λ bound `certifyObligationRules`' ambient gate uses (against `model.nonMegaCommits`,
// the population those counts were drawn from), is reported as background, never merged with the specific list:
// maintainer note *obligations-design* §2 measured raw co-change recall@3 (0.285) losing to the null "3 hottest
// recently-changed files" (0.336), the entire deficit being the ambient half.
export function cochangeData(model, changed) {
  const hits = new Map();
  // same liveness source and idiom as `cochangePartners`'s own `live` and `howCmd`'s places[] `exists` flag — one
  // house-wide answer to "is this path still here at HEAD", never a second liveness check invented per renderer.
  const live = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
  const N = model.nonMegaCommits || 0;
  const idx = cochangeIdxCost((model.cochange || []).length);
  for (const c of model.cochange || [])
    for (const f of changed) {
      let file, n, k;
      if (c.a === f && !changed.includes(c.b)) [file, n, k] = [c.b, c.commitsA || c.sup, c.commitsB || 0];
      else if (c.b === f && !changed.includes(c.a)) [file, n, k] = [c.a, c.commitsB || c.sup, c.commitsA || 0];
      else continue;
      const bits = partnerBits(c.sup, n, k, N, idx);
      const hit =
        bits != null
          ? { file, sup: c.sup, commits: n, bits, dead: !live.has(file), ambient: false }
          : clearsOwnRate(k, N)
            ? { file, sup: c.sup, commits: n, dead: !live.has(file), ambient: true, k, n: N, share: +(k / N).toFixed(3) }
            : null;
      if (!hit) continue;
      const prev = hits.get(file); // several changed files can name one partner: keep its strongest reading
      if (!prev || (prev.ambient && !hit.ambient) || (prev.ambient === hit.ambient && hit.sup * prev.commits > prev.sup * hit.commits))
        hits.set(file, hit);
    }
  // strongest partner first (the edited file's own rate, then raw support), file only as the final tiebreak, so
  // slice(0,5) below keeps the best ones. Ambient hits sort in the same pass (a caller that wants them separated,
  // like `completenessDirectional`, filters by `.ambient` afterward).
  return [...hits.values()].sort(
    (a, b) => b.sup / b.commits - a.sup / a.commits || b.sup - a.sup || (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)
  );
}
// scope-level co-change for `check <file>` (§J5.7b): the same co-change cell cochangeData applies to file pairs, over
// model.scopeCochange's SCOPE-key pairs instead — every pair with a scope in the checked file whose partner scope is
// touched beside it more often than its own base rate over `model.scopeCommitsN` (the commits the scope counts were
// drawn from). `partitionName` is the checked file's own partition (r.partition): a rendered pair may name a scope in
// a different file/partition, but the line is anchored to the file the caller is looking at.
export function scopeCochangeLines(model, rel, partitionName) {
  const rows = [];
  const N = model.scopeCommitsN || 0;
  const idx = cochangeIdxCost((model.scopeCochange || []).length);
  for (const p of model.scopeCochange || []) {
    const ia = p.a.indexOf('#'),
      ib = p.b.indexOf('#');
    if (ia < 0 || ib < 0) continue;
    const aIn = p.a.slice(0, ia) === rel,
      bIn = p.b.slice(0, ib) === rel;
    if (!aIn && !bIn) continue;
    const commits = aIn ? p.commitsA || 1 : p.commitsB || 1;
    const conf = p.sup / commits;
    if (partnerBits(p.sup, commits, aIn ? p.commitsB || 0 : p.commitsA || 0, N, idx) == null) continue;
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
// not change it (except the `(deleted)` marker on a dead partner). The NO-hit case never certifies `(complete)` —
// that phrase claims an absence this model cannot see — it says what was tested instead. A SEPARATE ambient
// section is added (`ambientLines`, shared with `obligationLines`) — never merged into this list (maintainer note
// *obligations-design* §2: the ambient half crowds out the non-obvious half worth reading).
export function completenessDirectional(model, changed) {
  const hits = cochangeData(model, changed);
  const specific = hits.filter(h => !h.ambient);
  const ambient = hits.filter(h => h.ambient);
  const out = specific.length
    ? [
        `[grain] Edits like this historically also touch:`,
        ...specific
          .slice(0, 5)
          .map(h => `  - ${h.file}${h.dead ? ' (deleted)' : ''} (co-changed in ${h.sup}/${h.commits} commits)`),
      ]
    : [`no file changes with these more often than it changes anyway`];
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
