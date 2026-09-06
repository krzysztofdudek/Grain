// grain engine · whatCmd — words to the concept card
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { CFG } from './config.mjs';
import { refineModOf } from './relations.mjs';
import { buildCards, normTok } from './cards.mjs';
import { VALUE_KIND_LABEL, gatedValueEvidence, testedByEvidence, typeRefHits } from './evidence.mjs';
import { part, ptr } from './facts.mjs';
import { scopeLine, scopeLineEnd } from './lexical.mjs';
import { voice } from './mine.mjs';
import { tokenize } from './parse.mjs';
import { QSTOP } from './placement.mjs';

export function whatCmd({
  model,
  H,
  query,
  exemplarOk = () => true,
  rawScopes = null,
  blindHit = null,
  ungrammaredHit = null,
}) {
  const q = query;
  const qt = new Set(tokenize(q).map(normTok));
  for (const t of [...qt]) if (QSTOP.has(t)) qt.delete(t); // instruction fillers never count — same cut whereCmd/howCmd make

  // (a) declarations: score every card by whereCmd's own IDF, then — for each hit — list the card's own MEMBERS
  // (not its aggregate vocabulary) whose OWN name tokens overlap the query. A directory card has no members and
  // never contributes here; that is deliberate, "declared" names a scope, not a place.
  const cards = buildCards(model);
  const df = new Map();
  for (const c of cards) for (const t of c.toks.keys()) df.set(t, (df.get(t) || 0) + 1);
  const maxIdf = Math.log2(1 + cards.length);
  const idf = new Map();
  for (const t of qt) idf.set(t, df.get(t) ? Math.log2(1 + cards.length / df.get(t)) : maxIdf);
  const idfSum = [...idf.values()].reduce((a, b) => a + b, 0);
  for (const c of cards) {
    let s = 0;
    for (const [t, w] of idf) s += (c.toks.get(t) || 0) * w;
    c.score = idfSum ? s / idfSum : 0;
  }

  const defined = [];
  const seenDef = new Set();
  const pushDef = (rel, kind, name, line, endLine) => {
    if (!line || !exemplarOk(rel)) return;
    const key = rel + '#' + kind + '#' + name + '#' + line;
    if (seenDef.has(key)) return;
    seenDef.add(key);
    defined.push({ rel, kind, name, line, endLine: endLine && endLine > line ? endLine : line });
  };
  // ANY shared token used to be enough (`.some`) — a single incidental word ("level", "web") from a multi-token
  // query was enough to claim an unrelated symbol as a hit, with full confidence (§002). The query's OWN tokens
  // must now be FULLY covered by the candidate's tokens: a no-op for a single-token query (still exactly the old
  // `.some` behavior — `status` matching `PENDING_STATUS` is unaffected), a real tightening for a multi-token one
  // (`PriorityLevel` no longer covers `LogLevel`; a 5-word dotted config key no longer covers a class that only
  // shares one of its five words).
  const coversQt = toks => qt.size > 0 && [...qt].every(t => toks.has(t));
  const nameHits = name => coversQt(new Set(tokenize(name).map(normTok)));
  for (const c of cards) {
    if (c.score <= 0) continue;
    if (c.type === 'file') {
      const P = part(model, c.part);
      for (const [kind, name, line, endLine] of P.fileScopes?.[c.label] || []) {
        if (kind === 'catch' || kind === 'finally') continue;
        if (nameHits(name)) pushDef(c.label, kind, name, line, endLine);
      }
    } else if (c.type === 'group' || c.type === 'marker') {
      const P = part(model, c.part);
      for (const k of c.members || []) {
        const [rel, kind, name] = k.split('#');
        // §061: a catch/finally member's `name` is its enclosing method/type's OWN name (blockScope's borrowed
        // "named after its owner", §extractScopes) — the same reason the file-card branch above already excludes
        // them; a role/marker group mixes every non-file/module kind (§induceRoles), so this branch needs the
        // identical guard or a query for the enclosing declaration surfaces its unrelated catch/finally twin too.
        if (kind === 'catch' || kind === 'finally') continue;
        if (!nameHits(name)) continue;
        pushDef(rel, kind, name, scopeLine(P, k), scopeLineEnd(P, k));
      }
    }
  }
  const ql = q.toLowerCase();
  // §036: an exact-name match sorts first, ahead of the old rel/line order — a display cap must show the true
  // answer, not merely count it. Ties within "exact" or within "not exact" keep the previous rel/line order
  // (Array#sort is stable), so this is a superset of the old ordering, not a behavior change for any query with
  // zero or one exact match already inside the first 12.
  defined.sort((a, b) => {
    const ea = a.name.toLowerCase() === ql,
      eb = b.name.toLowerCase() === ql;
    if (ea !== eb) return ea ? -1 : 1;
    return a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : a.line - b.line;
  });
  // §032/§036: exactLocal — is the query the EXACT name of something declared here (case-insensitive), not merely
  // a token-overlap hit? "no" is the exact shape of an external/vendor type — `defined`'s fuzzy matches above, if
  // any, only share WORDS with the query; none of them IS the query. Only then does the structural reference
  // lookup below run — a type that IS declared locally already has a correct, complete answer through (a).
  //
  // Computed over the FULL sorted set, BEFORE the splice(12) display cap two lines down. §036: with heavy
  // token collision (a common word/suffix shared by a dozen unrelated declarations) the old code computed this
  // over the already-truncated list, so the real declaration could be pushed past position 12 by nothing more
  // than alphabetically-earlier paths — manufacturing a false "external/vendor" verdict about a type declared
  // right here. A display cap must never feed a semantic verdict.
  const exactLocal = defined.some(d => d.name.toLowerCase() === ql);
  // §039 — the same lesson as §036, one step further: everything DERIVED from the declaration hits is computed
  // from this full set too, not from the twelve rows that survive the cap. `spread:` and `used by: N files` read
  // as measurements OF THE REPOSITORY, and a developer judging whether a symbol is safe to change gets a
  // systematically optimistic number when the cap silently truncates the input to the count. The rendered list
  // stays capped — that is a real readability constraint — but the truncation is now stated (`+N more`) instead
  // of swallowed, and `spreadFiles` is returned so `howCmd`'s archetype cover can stop rebuilding it from the
  // capped half. A display cap must decide nothing but what is displayed.
  const definedAll = defined.slice();
  defined.splice(12);

  // (b) values: valueIndex keys (§J3.1) whose VALUE half tokenizes to something the query says
  const valueHits = [];
  for (const [key, places] of Object.entries(model.valueIndex || {})) {
    const i = key.indexOf(':');
    const k = key.slice(0, i),
      v = key.slice(i + 1);
    if (coversQt(new Set(tokenize(v).map(normTok)))) valueHits.push({ key, k, v, places });
  }
  valueHits.sort(
    (a, b) => b.places.length - a.places.length || (a.v < b.v ? -1 : a.v > b.v ? 1 : a.k < b.k ? -1 : 1)
  );

  // (c) spread: (a) ∪ (b)'s files, grouped by the same refined module assignment inLineForFile uses
  const spreadFiles = new Set(definedAll.map(d => d.rel)); // §039: the full set, never the capped one
  for (const h of valueHits) for (const [rel] of h.places) spreadFiles.add(rel);
  const spread = [];
  if (spreadFiles.size && model.filesAll) {
    const refined = model._archModOf || (model._archModOf = refineModOf(model.filesAll, model.pkgs || [], model.srcRoots || []));
    const byMod = new Map();
    for (const rel of spreadFiles) {
      const m = refined(rel);
      byMod.set(m, (byMod.get(m) || 0) + 1);
    }
    spread.push(
      ...[...byMod]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, 5)
        .map(([module, n]) => ({ module, n }))
    );
  }

  // (d) siblings — DELETED (§052). It printed the OTHER members of any container a matched value sits in, which
  // by construction is exactly the set of values that did NOT match the query. Measured across 7 languages
  // (.system/issues/052-what-siblings-noise/log.md): per-value precision 0.364 [0.29–0.44] over 165 blind hand
  // verdicts, against a pre-registered 0.70 bar and a tie-break that counts every unsure value as a hit — so
  // 0.364 is an upper bound. It fired on 218 of 420 of the repositories' own vocabulary queries and rendered a
  // mean of 72.7 values per line, worst single line 759, all in the `practiced` (statistical-claim) voice. The
  // gate does carry real signal (an arbitrary-container decoy baseline measured 0.127, z = 4.99), but this is a
  // PUSH surface — volunteered inside the answer to a different question — and §044's ruling is that a push
  // surface needs precision the reader does not have to audit. Restricting to NAMED containers was measured too
  // and does not rescue it: still 27.5 values per line, and it zeroes 3 of the 7 languages outright.
  //
  // The evidence keeps its home, exactly as §044 kept `model.twins`: `model.valueSiblings`/`valueContainer`/
  // `valueNorms` are untouched and `export` publishes them verbatim, and the PULL surface — `check`/`review`'s
  // `kin:` line — still speaks about these containers. `kin:` is the right home: it fires only when the reader's
  // own change touched that container, and it reads `model.valueNorms`, the KT/λ-certified co-travel test that
  // this line never consulted. Across the corpus that certification accepts 3 of 2393 containers; `what` was
  // rendering all 2393.

  // (e) commits: model.msgAffinity (built at index time from H.msgAff, §J2.4) works from the model alone — locating
  // it never needs H. The rendered count/date DOES need H.fps (§J2.1), so — exactly like `how` — that half is
  // loaded lazily by the caller and degrades all-or-nothing: no H means no `changes:` line, never a partial one.
  const affRow = (model.msgAffinity || []).find(r => [...qt].some(t => normTok(r.t) === t || r.t === t));
  let changes = null;
  if (affRow && H && H.fps && H.fps.length) {
    const hits = H.fps.filter(fp => fp.toks.includes(affRow.t));
    if (hits.length)
      changes = {
        commits: hits.length,
        last: new Date(Math.max(...hits.map(fp => fp.ts)) * 1000).toISOString().slice(0, 7),
      };
  }

  // (f) fan-in: incoming file-level edges into the top 3 declaration files, ranked by how many declarations matched.
  // §064 — a bare count could not be acted on: a reader had to fall back to grep to find the actual files, making
  // this the one answer measured worse than grep in the question-catalog study. The names are already sitting in
  // model.edges (no new extraction), so this now carries the real fan-in FILE NAMES, deduped and sorted, with the
  // rendered list capped the same way `defined`'s own display cap works two screens up (§039: a cap decides only
  // what is SHOWN, never what is measured — `total` always carries the true count, uncapped).
  let usedBy = null;
  let top3 = new Set();
  if (definedAll.length) {
    const byFile = new Map();
    for (const d of definedAll) byFile.set(d.rel, (byFile.get(d.rel) || 0) + 1); // §039: ranked over every hit, not the twelve shown
    top3 = new Set(
      [...byFile]
        .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
        .slice(0, 3)
        .map(([rel]) => rel)
    );
    const userFiles = [...new Set((model.edges || []).filter(e => top3.has(e.to)).map(e => e.from))].sort();
    if (userFiles.length) usedBy = { files: userFiles.slice(0, 12), total: userFiles.length };
  }

  // (f2) tested by (§065): same-stem naming, else co-change/import evidence — see testedByEvidence's own note.
  // Bounded to the same top-3 declaration files (f) already ranked, for the same reason (f) is.
  const testedBy = top3.size ? testedByEvidence(model, definedAll.filter(d => top3.has(d.rel))) : null;

  // (g) structural references (§032) — see `typeRefHits`'s own note. Only consulted for a name with no exact
  // local declaration; the count is real (an exact-name match against per-file structural facts, not token
  // overlap) but the NAME itself resolves to nothing declared here, so it is disclosed, never presented as an
  // ordinary `defined:`/`used by:` fact.
  let referenced = null;
  if (!exactLocal) {
    const refHits = typeRefHits(model, q);
    if (refHits.size) {
      const implN = [...refHits.values()].filter(s => s.has('implements')).length;
      const hintN = [...refHits.values()].filter(s => s.has('type hint')).length;
      referenced = { files: refHits.size, implements: implN, typeHint: hintN };
    }
  }

  const lines = [`«${q}» → what it is here:`];
  if (defined.length)
    lines.push(
      voice(
        'practiced',
        `defined: ${defined.map(d => `${ptr(d.rel, d.line, d.endLine)} \`${d.name}\` (${d.kind})`).join(' · ')}${definedAll.length > defined.length ? ` · +${definedAll.length - defined.length} more` : ''}`
      )
    );
  if (valueHits.length)
    lines.push(
      voice(
        'practiced',
        `values: ${valueHits.map(h => `\`${h.v}\` in ${h.places.length} place${h.places.length === 1 ? '' : 's'} (${VALUE_KIND_LABEL[h.k] || h.k})`).join(' · ')}`
      )
    );
  if (spread.length)
    lines.push(voice('practiced', `spread: ${spread.map(s => `${s.module} (${s.n})`).join(' · ')}`));
  if (changes)
    lines.push(
      voice(
        'practiced',
        `changes: ${changes.commits} commit${changes.commits === 1 ? '' : 's'} mention it, last ${changes.last} — \`grain how "${q}"\` for the shape`
      )
    );
  if (usedBy)
    lines.push(
      voice(
        'practiced',
        `used by: ${usedBy.files.join(', ')}${usedBy.total > usedBy.files.length ? ` · +${usedBy.total - usedBy.files.length} more` : ''}`
      )
    );
  if (testedBy)
    lines.push(
      voice(
        'practiced',
        testedBy.kind === 'same-stem'
          ? `tested by: ${testedBy.files.join(', ')}`
          : `tested by: ${testedBy.files.map(f => f.file + (f.dead ? ' (deleted)' : '')).join(', ')} (co-change/import evidence, not a same-stem match)`
      )
    );
  else if (definedAll.length)
    lines.push(
      voice(
        'map',
        `tested by: no test file identified for this symbol — same-stem naming, co-change history and import edges found no match; that does not prove no test exists`
      )
    );
  if (referenced) {
    const bits = [];
    if (referenced.implements)
      bits.push(
        `implements/extends it in ${referenced.implements} file${referenced.implements === 1 ? '' : 's'}`
      );
    if (referenced.typeHint)
      bits.push(
        `takes or returns it as a parameter/return type in ${referenced.typeHint} file${referenced.typeHint === 1 ? '' : 's'}`
      );
    lines.push(
      voice(
        'map',
        `«${q}» has no declaration anywhere in this repository (likely an external/vendor type) but is referenced structurally in ${referenced.files} file${referenced.files === 1 ? '' : 's'} — ${bits.join(' · ')}. Matched by its exact name against grain's own recorded supertype and parameter/return-type facts, not a resolved import — this count may still miss usages the extractor cannot see structurally (dynamic instantiation, reflection, string-based type references).`
      )
    );
  }
  let note = null;
  // §089 — the disclosure register, same convention as whereCmd's own: every hedge below is ALSO recorded here as
  // { kind, text }, `text` the verbatim rendered line, `kind` reusing `note`'s own existing kind vocabulary.
  // Deliberately separate from `note` itself (never adds a field to it) — `note`'s shape must not change, only
  // grow a sibling.
  const disclosures = [];
  // §037 — until now every honest-negative disclosure fired ONLY on an empty answer, and the field showed that is
  // the wrong half of the problem. An empty result already reads as "grain found nothing"; a page of unrelated
  // token-overlap hits reads as "grain found your thing", which is exactly when a caveat is most needed and was
  // least present. (Measured on okhttp: `what MAX_CONCURRENT_STREAMS` returned one unrelated TEST method and
  // suppressed the blind-file caveat built for precisely this case — `Settings.kt` parses to zero scopes on a real
  // tree-sitter-kotlin defect, so the true `const val` was invisible.)
  //
  // `weakName` states that case exactly: the answer is non-empty, yet NOTHING in it IS the query — no declaration
  // and no value carries the name, they only share words with it. That predicate is only trustworthy because §036
  // computes `exactLocal` over the full set, before the display cap.
  //
  // The ≥2-token condition is not a tuning knob; it is §002's own cut applied to the same evidence. For a SINGLE-
  // token query `coversQt` degrades to "any symbol containing this token", and by the identical logic that token's
  // verbatim appearance somewhere in a file is the birthday paradox, not evidence — a 30KB doc-comment-heavy file
  // contains almost any English word. Measured over 825 non-empty answers on nine real repos: without this
  // condition the caveat fires on 7.2% of them and the fires are essentially all single-word concept queries
  // («json», «auth», «impl», «filter», «found»); with it, 1.7%, and the fires are compound identifiers a reader
  // plainly copied out of a source file. That 1.7% is the number this disclosure has to be worth, and the empty-
  // answer path is deliberately NOT held to it — an answer that already says "nothing found" cannot be made
  // overconfident by a hedge, so it keeps §018's looser substring scan over every blind file. Different claims,
  // different evidentiary bars.
  const weakName =
    !!(defined.length || valueHits.length || referenced) &&
    !exactLocal &&
    !valueHits.some(h => h.v.toLowerCase() === ql) &&
    qt.size >= 2;
  if (weakName && blindHit) {
    // supplied by cmdWhat's bounded, word-boundary, peer-anomalous re-scan — never a repo-wide grep
    const text = voice(
      'map',
      `nothing above IS «${q}» — those hits only share words with it. The exact name does appear in ${blindHit}, a file that parsed with zero extracted scopes while files of its own kind parse normally here. Grain cannot see inside it, so a real declaration of «${q}» may be missing from this answer.`
    );
    lines.push(text);
    note = { kind: 'blind-weak', value: q, file: blindHit };
    disclosures.push({ kind: 'blind-weak', text });
  }
  if (!defined.length && !valueHits.length && !referenced) {
    // no INDEXED presence — but "indexed" and "exists" are not the same claim (§011/§018/§014): a gated
    // value (seen, excluded by the df floor) or a symbol whose exact text lives in a zero-scope file (§018/§014
    // shape) each get their own one-line disclosure instead of silently collapsing into the same bare "nothing" a
    // truly absent symbol gets.
    const gv = gatedValueEvidence(model, rawScopes, q);
    if (gv) {
      // the plain absence claim would be FALSE here — replaced, not appended
      const label = VALUE_KIND_LABEL[gv.valueKind] || gv.valueKind;
      // §056 — a same-container sibling list, when the gated evidence found one (see gatedValueEvidence's own
      // note): appended, never in place of, the df-floor explanation itself.
      const sibTxt = gv.siblings
        ? ` Declared alongside: ${gv.siblings.slice(0, 8).map(s => `\`${s}\``).join(', ')}${gv.siblings.length > 8 ? ` (+${gv.siblings.length - 8} more)` : ''}.`
        : '';
      const text =
        (gv.tooRare
          ? `«${q}» was seen as a ${label} in ${gv.df} file${gv.df > 1 ? 's' : ''} (${gv.files.slice(0, 3).join(', ')}) — below the ${CFG.valueDfMin}-file floor where concordance begins, so it is not indexed. Seen, not absent.`
          : gv.tooCommon
            ? `«${q}» was seen as a ${label} in ${gv.df} files — above the commonality ceiling (over ${Math.round(CFG.valueDfMaxShare * 100)}% of the repository), so it is treated as boilerplate rather than a distinguishing concordance. Seen, not absent.`
            : `«${q}» was seen as a ${label} in ${gv.df} file${gv.df > 1 ? 's' : ''} but was not retained in the value index. Seen, not absent.`) + sibTxt;
      const voiced = voice('map', text);
      lines.push(voiced);
      note = { kind: 'gated', value: q, valueKind: gv.valueKind, df: gv.df, files: gv.files, siblings: gv.siblings || [] };
      disclosures.push({ kind: 'gated', text: voiced });
    } else if (ungrammaredHit) {
      // §057 — a certified-absence sibling stronger than `blindHit` below: the exact text was found, on a
      // bounded re-scan (grain.mjs's `findUngrammaredHit`), inside a tracked file whose extension has no
      // grammar at all (`ungrammaredFiles`). Unlike `blindHit`'s "parsed to zero scopes" (a heuristic that needs
      // peer-anomaly framing to mean anything), "grain has no grammar for this format" is unconditionally true —
      // the plain absence claim below would be actively false here, not merely incomplete, so it is replaced.
      const text = voice(
        'map',
        `«${q}» has no declarations or values anywhere grain can parse — but that exact text appears in ${ungrammaredHit.file}: grain has no grammar for "${ungrammaredHit.ext}" and never reads that format at all. This may be a real declaration grain simply never looked at.`
      );
      lines.push(text);
      note = { kind: 'ungrammared', value: q, file: ungrammaredHit.file, ext: ungrammaredHit.ext };
      disclosures.push({ kind: 'ungrammared', text });
    } else if (blindHit) {
      // the exact text was found, on a bounded re-scan, inside a file that parsed to zero real scopes
      const text = voice(
        'map',
        `«${q}» is not indexed as a declaration or value — but that exact text appears in ${blindHit}, a file that parsed with zero extracted scopes. Grain cannot see inside it, so this may be a real declaration it missed.`
      );
      lines.push(text);
      note = { kind: 'blind', value: q, file: blindHit };
      disclosures.push({ kind: 'blind', text });
    } else {
      lines.push(voice('map', `«${q}» has no declarations or values anywhere in this repository's code`));
      note = { kind: 'absent' };
    }
    if (affRow)
      lines.push(
        voice(
          'example',
          `«${affRow.t}» appears in no code card here, but commits saying it touched: ${affRow.files
            .slice(0, 3)
            .map(([f, n]) => `\`${f}\` (${n})`)
            .join(' · ')}${affRow.ex ? ` — e.g. "${affRow.ex[1]}" (${affRow.ex[0]})` : ''}`,
          { sha: affRow.ex ? affRow.ex[0] : null }
        )
      );
  }

  // `definedTotal`/`spreadFiles`/`weakName` are internal (§039/§037): `cmdWhat` destructures the published fields
  // by name, so none of these reaches `what --json`. They exist for the two in-process callers — `howCmd`, which
  // needs the UNCAPPED (a)∪(b) file set, and `cmdWhat`, which needs to know whether a weak answer is worth paying
  // a bounded blind-file re-scan for before it touches the filesystem.
  return {
    lines,
    defined,
    definedTotal: definedAll.length,
    spreadFiles: [...spreadFiles],
    weakName,
    values: valueHits.map(h => ({ value: h.v, kind: h.k, places: h.places })),
    spread,
    changes: changes || {},
    usedBy: usedBy || {},
    referenced,
    testedBy: testedBy || null,
    note,
    disclosures,
  };
}
