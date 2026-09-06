// grain engine · whereCmd — intent to place, expectations and a pattern to copy
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { extname } from 'node:path/posix';
import { EXT2GRAMMAR } from './config.mjs';
import {
  TOKW,
  baselineClause,
  buildCards,
  cochangePartners,
  inLineForCard,
  normTok,
  practicedBy,
} from './cards.mjs';
import { decoLabel, factLabel, part, pct, ptr, scopeLabel } from './facts.mjs';
import { scopeLine, scopeLineEnd } from './lexical.mjs';
import { authorConcClause, deviantLine, factNotes, mine, skipLineNote, voice } from './mine.mjs';
import { tokenize } from './parse.mjs';
import { QSTOP, bridgeLines } from './placement.mjs';
import { ANON_SCOPE_KINDS, scopeBacktick, verbalize } from './verbalize.mjs';
import { heritageKindOf } from './weights.mjs';

export function whereCmd({
  model,
  query,
  top = 3,
  mapRows = 60,
  exemplarOk = () => true,
  ungrammaredHit = null,
}) {
  const q = query;
  const qt = new Set(tokenize(q).map(normTok));
  const cards = buildCards(model);
  // exact-name hits come from the query's whole words (and the last segment of dotted ones: `res.json` → `json`), never from
  // camelCase fragments — `TestRoutes` must pin `TestRoutes`, not every scope named `test`
  // …and only identifiers, not plain words: `TestRoutes`, `routes_command`, `res.json` pin their scope; `handler` is a word that
  // happens to be a function name too, and the directory `handlers/` (30 files) is the better answer for it
  const qraw = new Set(
    q
      .split(/\s+/)
      .filter(w => tokenize(w).length >= 2 || /[._$]/.test(w))
      .flatMap(w => {
        const t = w.toLowerCase().replace(/[^\w.$]/g, '');
        return t ? [t, t.split('.').pop()] : [];
      })
      .filter(t => t.length > 2)
  );
  const qrawToks = new Map();
  for (const w of q.split(/\s+/)) {
    const t = w.toLowerCase().replace(/[^\w.$]/g, '');
    const toks = tokenize(w).map(normTok);
    if (t) {
      qrawToks.set(t, toks);
      qrawToks.set(t.split('.').pop(), toks);
    }
  } // pinned word → the query tokens it covers
  // inverse document frequency over the cards: a query word every card carries (`test`, `router`, `add`) weighs little, the one
  // word that names the thing (`mount`, `compress`) weighs most; a word no card carries is the agent's phrasing, not a miss
  const df = new Map();
  for (const c of cards) for (const t of c.toks.keys()) df.set(t, (df.get(t) || 0) + 1);
  // instruction fillers never count; a DOMAIN word no card carries stays in the denominator at full weight — the repo not
  // speaking of it must lower the score ("add rate limiting" scored 100% on the word `add` alone when unmatched words were
  // dropped; now it scores what it deserves and the weak-match banner fires)
  for (const t of [...qt]) if (QSTOP.has(t)) qt.delete(t);
  const maxIdf = Math.log2(1 + cards.length);
  const idf = new Map();
  for (const t of qt) idf.set(t, df.get(t) ? Math.log2(1 + cards.length / df.get(t)) : maxIdf);
  const idfSum = [...idf.values()].reduce((a, b) => a + b, 0);
  // §012/G2 — what one query word is WORTH to a card. Every card but a file card answers with its own token
  // weights unchanged. A file card's weight is the max of two channels, because they are different evidence:
  //   · what the file IS — its own basename, its path, its doc comments, the supertypes it implements — at full
  //     weight, exactly as before (`baseToks`);
  //   · what the file CONTAINS — the names of its scopes — in proportion to HOW MUCH of the file carries the
  //     word: one of 3 scopes called `json` says the file is about json, 2 of 169 says almost nothing.
  // Before this, both channels were flat 1 (addTok keeps a max), so a 169-scope test file whose vocabulary
  // happened to contain every query word scored 100% and outranked the small file the query actually named —
  // measured as `where`'s single largest ranking defect on the stratum where the query names its file
  // (express: `added res json test` returned test/app.router.js, then test/res.send.js, over test/res.json.js).
  // No constant: the divisor is the card's own scope count, the same `n` the card already reports.
  const tw = (c, t) =>
    c.memberTok
      ? Math.max(
          c.baseToks.get(t) || 0,
          (c.memberW ?? TOKW.name) * ((c.memberTok.get(t) || 0) / Math.max(1, c.n || 1))
        )
      : c.toks.get(t) || 0;
  let anyExact = false; // §085 — set inside the scoring loop below; see `unknownIdent` at the return
  for (const c of cards) {
    let s = 0;
    for (const [t, w] of idf) s += tw(c, t) * w;
    c.score = idfSum ? s / idfSum : 0;
    // §070 — snapshot the score BEFORE the exact-name/dirName pins below can lift it off zero. This is the
    // card's own bag-of-words overlap with the query and nothing else: a card can only clear zero here by
    // sharing an actual query token with its content (doc comments, member names, values — whatever `c.toks`
    // indexes), never by an identifier or directory NAME merely matching. Read-only bookkeeping: nothing past
    // this line changes what `c.score` becomes or how `hits` gets filtered/sorted/sliced.
    c.lex0 = c.score;
    c.exact = c.names ? [...qraw].some(t => c.names.has(t)) : false; // a query word that IS a function/class name in this file
    if (c.exact) anyExact = true; // §085 — read-only bookkeeping: does the PARSED model declare any of the query's identifier words, anywhere?
    // a pinned identifier that IS most of the query wins outright (`where sendStatus`); one that covers a minority of the
    // query's words only adds to the lexical score — `where command handler for TodoList archive` must rank the command
    // handlers carrying `command`+`handler`+`todo`+`list` above `Entities/TodoList.cs`, which carries only the name (measured)
    if (c.exact) {
      const pinned = [...qraw].filter(t => c.names.has(t));
      const cover = new Set(pinned.flatMap(t => qrawToks.get(t) || [])).size / Math.max(1, qt.size);
      c.score = cover >= 0.5 ? Math.max(c.score, 1) : Math.min(1, c.score + 0.25);
    }
    if (c.dirName) {
      const hit = [...qt].filter(t => c.dirName.has(t));
      if (hit.length) {
        const cover = hit.length / Math.max(1, qt.size);
        // §012/G2 — a directory whose NAME is most of the query still wins outright. One that matches a minority
        // of it is worth exactly the share of the query it covers, not a flat +0.25: that constant routinely lifted
        // a wide directory card above the file the query actually named (petclinic: `src/test/` over
        // ValidatorTests.java on one shared word). Measured: it lifts BOTH strata, and deletes a tuned number.
        c.score = cover >= 0.5 ? Math.max(c.score, 1) : Math.max(c.score, cover);
      }
    }
    c.score = Math.min(1, c.score);
    if (c.degenerate) c.score *= 0.5;
  }
  const rank = c =>
    (c.exact ? 4 : c.type === 'marker' ? 2 : c.type === 'file' ? 1 : 1.5) + (c.facts.length ? 0.25 : 0); // on a tie: pinned identifier > marker > group/directory > file (a file's local facts never lift it over a directory)
  let hits = cards
    .filter(c => c.score > 0)
    .sort((a, b) => b.score - a.score || rank(b) - rank(a) || b.n - a.n || (a.label < b.label ? -1 : 1))
    .slice(0, top);
  const lines = [];
  // §089 — the disclosure register: every hedge/caveat line pushed below that qualifies an otherwise-confident
  // answer is ALSO recorded here as { kind, text }, at the exact site that builds the text — never recomputed
  // from the rendered string later. `text` is the verbatim line as it appears in `lines` (or would, before any
  // stamp/dirty-tree suffix), so a JSON consumer and a text reader are told the identical thing. `kind` reuses
  // whatever internal name already distinguishes the case (matching whatCmd's own `note.kind` vocabulary where
  // the same concept applies — `ungrammared` is shared with whatCmd on purpose).
  const disclosures = [];
  // a steer renders wherever its topic meets the query or its exemplar lives in the card: decided, beside what is practiced
  const steers = (model.steers || []).filter(st => st.found);
  const steerLine = st =>
    st.surfaces
      .filter(sf => sf.value !== null && !sf.retires)
      .map(
        sf =>
          `  ${voice('decided', `${verbalize({ pid: sf.pid, exp: sf.value, kind: st.kind, heritageKind: heritageKindOf(sf.pid, model) }, [st.name])} — ${practicedBy(sf)}${baselineClause(sf)}${st.note ? ' · ' + st.note : ''} · copy ${st.path}:${st.line} \`${st.name}\``, { typ: 'steer', who: st.author, when: st.createdAt })}`
      );
  const topicHit = st => {
    const tt = new Set(tokenize(st.topic).map(normTok));
    return [...qt].some(t => tt.has(t));
  };
  const cardHit = (st, c) =>
    c.type === 'file'
      ? c.label === st.path
      : c.type === 'directory'
        ? st.path.startsWith(c.label)
        : c.members
          ? c.members.some(k => k.startsWith(st.path + '#') && k.split('#')[2] === st.name)
          : false;
  const orphanSteers = steers.filter(st => topicHit(st) && !hits.some(c => cardHit(st, c)));
  for (const st of orphanSteers) {
    const sl = steerLine(st);
    if (sl.length) {
      lines.push(voice('map', `«${q}» → maintainer decision ${st.id} (no card of its own carries it)`));
      lines.push(...sl);
    }
  }
  let noConfidentHit = false,
    suppressedScore = 0; // set when the top hit is demoted to "untrustworthy" below — distinct wording from a genuine zero-hit
  // §070 (research/where-lever) — on the leak-free stratum, 36% of the files `where` should have named share zero
  // content-lexical overlap with the query (`lex0` above). Most of those are NOT the `!hits.length` case below —
  // something ELSE in the repo still scores — so the reader sees a normal-looking ranked list built entirely on an
  // identifier or directory NAME pin, with zero corroborating content-word overlap anywhere in the top hits — the exact shortcut
  // §2.1 of the research doc measured directly ("cards lifted off zero by the exact-name pin without any token
  // match"). Checked before `weak match` below because a name pin can win outright (`score` reaches 1, well past
  // 0.34), so the flat-score banner never catches it — the structural fact that NO shown card's content shares a
  // query word is the one signal here, not a new cutoff (§018/§037's rule: an already-weak answer cannot be made
  // overconfident by saying so, so this fires regardless of how high the pinned score climbed).
  const noContentFoothold = hits.length > 0 && hits.every(h => h.lex0 === 0);
  if (noContentFoothold) {
    const sig = hits[0].exact ? 'an exact identifier/name match' : 'a directory-name match';
    const text = `no card matches these words — the ranking below is by ${sig}, not text overlap; verify before building on it.`;
    lines.push(text);
    disclosures.push({ kind: 'no-content-foothold', text });
  } else if (hits.length && hits[0].score < 0.34) {
    const text = `weak match: the best hit covers ${Math.round(hits[0].score * 100)}% of the query's weight — a hint, not an answer. If the hits look unrelated to what you are writing, open the nearest sibling of the file you expect to edit instead.`;
    lines.push(text);
    disclosures.push({ kind: 'weak-answer', text });
  } else if (hits.length && qt.size >= 3 && !hits[0].exact) {
    const contributing = [...idf.keys()].filter(t => tw(hits[0], t) > 0); // the SAME per-word weight the score was built from, so "which words carried this hit" can never disagree with the score itself
    // mass concentration: "exactly one contributing word" (ratio 1) generalized to how much of the top hit's matched
    // weight sits in its single heaviest word — a hit carried almost entirely by one term is just as coincidental as a
    // one-word hit, even when a second term nominally "contributed" (measured: a query's rare words each independently
    // landing on unrelated cards inflated `contributing.length` past 1 while the hit stayed just as coincidental)
    const weights = contributing.map(t => tw(hits[0], t) * idf.get(t));
    const totalW = weights.reduce((a, b) => a + b, 0);
    const concentration = totalW ? Math.max(...weights) / totalW : 1;
    if (contributing.length < qt.size && concentration >= 0.5) {
      // cross-hit agreement: do the runner-ups (already computed, `hits` is sliced to `top`) point at the same area of
      // the repo as the top hit, or somewhere unrelated? real answers tend to cluster; a coincidental lexical collision
      // usually doesn't, because its matched words came from parts of the repo that have nothing else in common
      const dirOf = c => (c.topDirs && c.topDirs[0] ? c.topDirs[0][0] : c.label);
      const baseName = d => (d || '').split('/').filter(Boolean).pop() || d;
      const sameArea = (a, b) =>
        !!a &&
        !!b &&
        (a === b ||
          baseName(a) === baseName(b) ||
          (a + '/').startsWith(b + '/') ||
          (b + '/').startsWith(a + '/'));
      const runnerUps = hits.slice(1, 3);
      const agreeing = runnerUps.filter(h => sameArea(dirOf(hits[0]), dirOf(h))).length;
      if (runnerUps.length && !agreeing) {
        suppressedScore = hits[0].score;
        hits = [];
        noConfidentHit = true;
      } // no corroboration anywhere in the top few — don't rank it, map the repo instead
      else {
        const text = `note: the top hit matches only «${contributing.join('», «')}» of your ${qt.size} words — verify before building on it.`;
        lines.push(text);
        disclosures.push({ kind: 'partial-word-coverage', text });
      }
    }
  }
  // §085 — the THIRD path into §057's honest negative, and the only one neither §057 nor §070 could reach.
  // §057 asks for the never-parsed file only when `hits` is EMPTY; §070 only when every shown hit has zero
  // content overlap (`lex0`). Between them sits the measured failure: a compound identifier (`indent_style`,
  // `AppleScript`, `ClangFormat`) that `tokenize` SPLITS into ordinary words, each of which really does occur in
  // the code — so hits are non-empty AND `lex0 > 0`, the score clears the 0.34 floor, and a one-word query never
  // reaches the `qt.size >= 3` note either. Every existing check stands down while the ranking is built entirely
  // out of fragments of a name the parsed model never declares. `ungrammaredHit` arrives here exactly when the
  // caller (grain.mjs's `cmdWhere`) found that same text verbatim in a file grain has no grammar for, so the
  // answer the reader wants sits in a file grain cannot read. Nothing new is tuned: the gate is `unknownIdent`
  // (see the return) plus the deterministic verbatim scan §057 already owns.
  //
  // Placed AFTER the whole ladder above and gated on `hits.length` on purpose. The ladder's last arm can SUPPRESS
  // an uncorroborated top hit (`hits = []`, `noConfidentHit`) — a stronger honest negative than any banner — and
  // an earlier placement pre-empted it, measurably: it kept 6 of opencode's rankings that the suppression arm had
  // been discarding. Running last means a suppressed answer stays suppressed and falls through to §057's own
  // message below, which names this same file anyway; only an answer that SURVIVES the ladder is disclosed here.
  if (ungrammaredHit && hits.length) {
    const text = `"${q}" is not a name grain parsed anywhere — the ranking below matches its separate words, not the whole. That exact text appears in ${ungrammaredHit.file}, and grain has no grammar for "${ungrammaredHit.ext}" (never reads that format at all, so this file was never parsed). The answer may be there, unreadable to grain: verify before building on it.`;
    lines.push(text);
    disclosures.push({ kind: 'ungrammared', text });
  }
  if (!hits.length) {
    // §057 — a zero-hit answer here reads as "this concept isn't in the repository", which is only true of the
    // code grain actually reads. `ungrammaredHit` (supplied by the caller — grain.mjs's `findUngrammaredHit`, a
    // bounded substring scan over `ungrammaredFiles`, never a repo-wide grep) says the query's exact text lives,
    // verbatim, in a tracked file whose extension has no grammar at all: a stronger, deterministic sibling of the
    // parsed-but-empty case below, so it takes priority over both other messages when present.
    const zeroHitText = ungrammaredHit
      ? `no lexical match for "${q}" in parsed code — but that exact text appears in ${ungrammaredHit.file}, and grain has no grammar for "${ungrammaredHit.ext}" (never reads that format at all, so this file was never parsed). This may be a real hit grain cannot see. Compact map of the source groups, markers and directories follows regardless.`
      : noConfidentHit
        ? `no confident match for "${q}" — the best lexical hit scored ${Math.round(suppressedScore * 100)}% but its words are covered by unrelated, disagreeing parts of the repo, so it is not trustworthy. Compact map of the source groups, markers and directories follows. Pick the closest entry yourself and open its files; do not re-ask with synonyms.`
        : `no lexical match for "${q}" — compact map of the source groups, markers and directories follows. Pick the closest entry yourself and open its files; do not re-ask with synonyms.`;
    lines.push(zeroHitText);
    // a genuine "nothing found" (neither branch below) is the honest answer itself, not a caveat qualifying a
    // confident one — same precedent as whatCmd's `note.kind === 'absent'`, which is likewise never disclosed
    if (ungrammaredHit) disclosures.push({ kind: 'ungrammared', text: zeroHitText });
    else if (noConfidentHit) disclosures.push({ kind: 'honest-negative', text: zeroHitText });
    lines.push(...bridgeLines(model, qt, df));
    const sorted = cards
      .filter(c => c.type !== 'file')
      .sort((a, b) => b.n - a.n || (a.label < b.label ? -1 : 1));
    for (const c of sorted.slice(0, mapRows))
      lines.push(`  [${c.type}] ${c.label} (${c.n}) → ${c.topDirs.map(([d]) => d + '/').join(' · ')}`);
    if (sorted.length > mapRows)
      lines.push(`  … and ${sorted.length - mapRows} more — re-run with --map-rows ${sorted.length} for all`);
    if (!cards.length)
      lines.push(
        '  (the model holds no groups or directory norms — no strong conventions were found in this repository)'
      );
    return { lines, hits: [], cards, disclosures };
  }
  const bridged = bridgeLines(model, qt, df); // query words the code never says, translated by the commit history
  // the "comes with" recipe's file-shape clause: an accepted auto.filebirth verdict for the SAME population
  // (already computed by learn(), never re-derived here) phrased to read first, before companion/registration
  const filebirthBit = f =>
    f.exp === 'new'
      ? `usually starts a new file (${pct(f.share)}% of ${f.sraw})`
      : `is usually added to an existing file (${pct(f.share)}% of ${f.sraw})`;
  for (const h of hits) {
    const inl = inLineForCard(model, h);
    if (inl) lines.push(inl);
    const stLines = steers.filter(st => cardHit(st, h)).flatMap(steerLine); // decided, printed right under the card's header
    if (h.type === 'file') {
      const qs = [...qt];
      const hitsOf = k => {
        const nm = k.split('#')[2] || '';
        const toks2 = tokenize(nm).map(normTok);
        return (qraw.has(nm.toLowerCase()) ? 10 : 0) + qs.filter(t => toks2.includes(t)).length;
      };
      const matching = h.members
        .map(k => [k, hitsOf(k)])
        .filter(([, n]) => n > 0)
        .sort(
          (a, b) =>
            b[1] - a[1] ||
            tokenize(a[0].split('#')[2] || '').length - tokenize(b[0].split('#')[2] || '').length ||
            (a[0] < b[0] ? -1 : 1)
        )
        .slice(0, 6)
        .map(([k]) => {
          const [, kind, name, line] = k.split('#');
          return `\`${name}\` (${kind}${line ? ', line ' + line : ''})`;
        });
      lines.push(
        voice(
          'map',
          `«${q}» → file ${h.label} — ${h.n} scopes (${scopeLabel(h.part)}, match ${Math.round(Math.min(1, h.score) * 100)}%)${matching.length ? ` · matching here: ${matching.join(' · ')}` : ''}`
        ),
        ...stLines
      );
      const TRIVIAL =
        /^(none|void|str|string|bool|boolean|int|number|float|any|t\.any|object|list|dict|error|unit|self|this|t|f)$/i;
      const carried = (h.carried || [])
        .filter(([mk]) => !mk.startsWith('ret:') || !TRIVIAL.test(mk.slice(4)))
        .sort((a, b) => b[1] - a[1]);
      const cardG = EXT2GRAMMAR[extname(h.label)]; // `h.label` is this card's own file rel path — §048
      if (carried.length)
        lines.push(
          `  carries: ${carried
            .slice(0, 5)
            .map(
              ([mk, n]) =>
                `${mk.startsWith('deco:') ? decoLabel(mk.slice(5), cardG) : mk.startsWith('sup:') ? 'extends ' + mk.slice(4) : 'returns ' + mk.slice(4)} ×${n}`
            )
            .join(' · ')}`
        );
      for (const f of h.facts.slice(0, 3))
        lines.push(
          `  - ${voice(
            'practiced',
            `${factLabel(part(model, h.part), f)}: ${verbalize(
              f,
              f.exemplars.map(e => e.name)
            )} — ${pct(f.share)}% of ${f.sraw}`
          )}`
        );
      const cc = cochangePartners(model, [], 3, h.label);
      if (cc.length)
        lines.push(
          `  historically co-changes with: ${cc.map(c => `${c.partner}${c.dead ? ' (deleted)' : ''} (${c.sup}/${c.commits} commits)`).join(' · ')}`
        );
      continue;
    }
    lines.push(
      voice(
        'map',
        `«${q}» → ${h.type} ${h.label} — ${h.type === 'group' ? `${h.n} members` : h.type === 'marker' ? `${h.n} carriers` : `${h.files?.length ?? '?'} files, ${h.facts.length ? h.n + ' established' : h.n + ' scopes'}`} (${scopeLabel(h.part)}, match ${Math.round(h.score * 100)}%)`
      )
    );
    lines.push(...stLines);
    if (h.type === 'directory' && model.moduleGraph) {
      const id = h.label.replace(/\/$/, '');
      const dep = model.moduleGraph.edges.filter(e => e.from === id).slice(0, 4),
        used = model.moduleGraph.edges.filter(e => e.to === id).slice(0, 4);
      if (dep.length) lines.push(`  depends on: ${dep.map(e => `${e.to}/ (${e.n})`).join(' · ')}`);
      if (used.length) lines.push(`  used by: ${used.map(e => `${e.from}/ (${e.n})`).join(' · ')}`);
      for (const bd of model.boundaries || [])
        if ((id + '/').startsWith(bd.boundary.from + '/'))
          lines.push(
            `  ${voice('decided', `never imports ${bd.boundary.to}/${bd.note ? ' — ' + bd.note : ''}`, { typ: 'boundary', who: bd.author, when: bd.createdAt })}`
          );
    }
    if (h.members)
      lines.push(
        `  lives in: ${h.topDirs.map(([d, n]) => `${d}/ (${Math.round((n / h.n) * 100)}%)`).join(' · ')}`
      );
    const P = part(model, h.part);
    const withLine = k => {
      const [rel2, kind, name] = k.split('#');
      const ln = scopeLine(P, k);
      const end = scopeLineEnd(P, k);
      // §061: `name` for a catch/finally member is its enclosing method/type's OWN name — scopeBacktick already
      // says so ("catch in `findOwner`"), so the trailing "(kind)" would just repeat it; kept only for a genuine
      // declaration, exactly as before this fact existed.
      const tag = ANON_SCOPE_KINDS.has(kind) ? scopeBacktick({ kind, name }) : `\`${name}\` (${kind})`;
      return `${ln ? ptr(rel2, ln, end) : rel2} ${tag}`;
    };
    if (h.type === 'marker') {
      const ex = h.members.slice(0, 3).map(withLine);
      lines.push(
        `  carriers to copy: ${ex.join(' · ')}${h.members.length > 3 ? ` · +${h.members.length - 3} more` : ''}`
      );
      const mkKey = h.mpid
        ? h.mpid
            .replace(/^auto\.deco:@?/, 'deco:')
            .replace(/^auto\.extends:/, 'sup:')
            .replace(/^auto\.returns:/, 'ret:')
        : '';
      const obs = (part(model, h.part).markerObs || {})[mkKey] || [];
      if (obs.length) lines.push(`  its carriers share (observed, not certified): ${obs.join(' · ')}`);
      const mi = (part(model, h.part).markerImplied || {})[mkKey];
      // a marker has no cid of its own — the populations where it IS the accepted convention (its own defining
      // facts, already selected into h.facts by `carries` above) are the only populations it can borrow a
      // filebirth verdict from; matching by their cid is the same "same population" test the group case makes
      // via its role cid, just read off facts the card already carries instead of constructed fresh
      const mFbCids = new Set(h.facts.filter(f => f.pid === h.mpid).map(f => f.cid));
      const mFb = mFbCids.size
        ? part(model, h.part).facts.find(f => f.pid === 'auto.filebirth' && mFbCids.has(f.cid))
        : undefined;
      {
        const bits = [];
        if (mFb) bits.push(filebirthBit(mFb));
        if (mi) {
          if (mi.companion)
            bits.push(
              `a same-stem \`${mi.companion.pattern}\` companion (${pct(mi.companion.share)}% of ${mi.companion.n} have one, e.g. \`${mi.companion.example}\`)`
            );
          if (mi.importedBy)
            bits.push(
              `registration in \`${mi.importedBy.file}\` (imports ${mi.importedBy.n} of ${mi.importedBy.of} carriers)`
            );
          if (mi.importedByPattern)
            bits.push(
              `registration by a \`${mi.importedByPattern.pattern}\` file (${mi.importedByPattern.n} of ${mi.importedByPattern.of} carriers)`
            );
        }
        if (bits.length) lines.push(`  a new carrier comes with: ${bits.join(' · ')}`);
      }
      const best = [...h.facts].sort((a, b) => b.sraw - a.sraw)[0];
      if (best) {
        const own =
          best.pid === h.mpid
            ? best
            : { ...((best.siblings || []).find(sb => sb.pid === h.mpid) || best), kind: best.kind };
        lines.push(
          `  - ${voice(
            'practiced',
            `${verbalize(
              own,
              best.exemplars.map(e => e.name)
            )} — ${pct(best.share)}% of ${best.sraw}${
              own !== best
                ? ` (with: ${verbalize(
                    best,
                    best.exemplars.map(e => e.name)
                  ).replace(/^\w+ here /, '')})`
                : ''
            }${factNotes(best)}`
          )}`
        );
      }
      continue;
    }
    if (!h.facts.length)
      lines.push(
        `  - no convention certified here beyond placement (the group is small, not free-form) — open a member below and copy its shape`
      );
    let bulletFacts = h.facts;
    if (h.type === 'group' && h.roleIdx !== undefined) {
      const pf = (part(model, h.part).profiles || {})[h.roleIdx];
      if (pf) {
        const bits = [
          `${pf.n} members share this skeleton (~${Math.round(pf.coverage * 100)}% of an average member): ${pf.skel}`,
        ];
        for (const pi of pf.perInstance)
          bits.push(
            `one slot is per-instance (${pi.distinct} distinct values in ${pi.total} — e.g. \`${pi.top}\`)`
          );
        for (const sl of pf.slots) bits.push(`slot usually \`${sl.top}\` (${sl.k}/${sl.total})`);
        if (pf.held)
          bits.push(`held since ${pf.held.since}${pf.held.fresh ? ` · ${pf.held.fresh} new in 180d` : ''}`);
        lines.push('  superposition: ' + bits.join(' · '));
      }
      const gi2 = (part(model, h.part).groupImplied || {})[h.roleIdx];
      // the group's own cid convention (`'r' + roleIdx + ':' + kind`) is exactly how h.facts was already
      // filtered when the card was built, so an accepted auto.filebirth fact for this same population is
      // already sitting in h.facts if it exists — no separate lookup or synthetic cid needed
      const fbFact = h.facts.find(f => f.pid === 'auto.filebirth');
      {
        const bits = [];
        if (fbFact) bits.push(filebirthBit(fbFact));
        if (gi2) {
          if (gi2.companion)
            bits.push(
              `a same-stem \`${gi2.companion.pattern}\` companion (${pct(gi2.companion.share)}% of ${gi2.companion.n} have one, e.g. \`${gi2.companion.example}\`)`
            );
          if (gi2.importedBy)
            bits.push(
              `registration in \`${gi2.importedBy.file}\` (imports ${gi2.importedBy.n} of ${gi2.importedBy.of} members)`
            );
          if (gi2.importedByPattern)
            bits.push(
              `registration by a \`${gi2.importedByPattern.pattern}\` file (${gi2.importedByPattern.n} of ${gi2.importedByPattern.of} members are imported by one)`
            );
        }
        if (bits.length) lines.push(`  a new member comes with: ${bits.join(' · ')}`);
      }
      if (model.twins) {
        const tw = model.twins.find(
          t =>
            (t.a.part === h.part && t.a.role === h.roleIdx) || (t.b.part === h.part && t.b.role === h.roleIdx)
        );
        if (tw) {
          const mine = tw.a.part === h.part && tw.a.role === h.roleIdx;
          const other = mine ? tw.b : tw.a;
          const otherSuf = tw.namedDifferently
            ? mine
              ? tw.namedDifferently[1]
              : tw.namedDifferently[0]
            : null;
          lines.push(
            `  twin: structurally the same as «${other.label}» (${other.part})${otherSuf ? `, named \`*${otherSuf[0].toUpperCase()}${otherSuf.slice(1)}\` there` : ''}`
          );
        }
      }
      // folded into the recipe line above — must not also print as one of the ordinary bullets below
      if (fbFact) bulletFacts = h.facts.filter(f => f !== fbFact);
    }
    let dlShown = false; // the first fact that HAS deviants names them — what not to copy
    bulletFacts.slice(0, 6).forEach(f => {
      lines.push(
        `  - ${voice(
          'practiced',
          `${verbalize(
            f,
            f.exemplars.map(e => e.name)
          )} — ${pct(f.share)}% of ${f.sraw}${factNotes(f)}${f.authorConc ? ` · ${authorConcClause(f.authorConc)}` : ''}`
        )}`
      );
      if (!dlShown) {
        const dl = deviantLine(f);
        if (dl) {
          lines.push(dl);
          dlShown = true;
        }
      }
    });
    // exemplars: types and methods before file scopes — a class to copy beats a filename to copy
    const kindRank = e => (/\.[a-z]+$/i.test(e.name) && e.line === 1 ? 1 : 0);
    const ex = [...new Map(h.facts.flatMap(f => f.exemplars.map(e => [e.rel + e.name, [e, f]]))).values()]
      .filter(([e]) => exemplarOk(e.rel))
      .sort((a, b) => kindRank(a[0]) - kindRank(b[0]))
      .slice(0, 3);
    if (ex.length)
      lines.push(
        `  pattern to copy: ${ex.map(([e, f]) => `${ptr(e.rel, e.line, e.endLine)} ${scopeBacktick({ kind: f.kind, name: e.name })}${skipLineNote(part(model, h.part), f, e)}${e.why ? ` — ${e.why}` : ''}`).join(' · ')}`
      );
    else if (h.members) {
      const ms = h.members.slice(0, 3).map(withLine);
      lines.push(`  members to look at: ${ms.join(' · ')}`);
    } else if (h.files?.length)
      lines.push(
        `  files to look at: ${h.files.slice(0, 3).join(' · ')}${h.files.length > 3 ? ` · +${h.files.length - 3} more` : ''}`
      );
    const cc = cochangePartners(
      model,
      h.topDirs.map(([d]) => d)
    );
    if (cc.length)
      lines.push(
        `  historically co-changes with: ${cc.map(c => `${c.partner}${c.dead ? ' (deleted)' : ''} (${c.sup}/${c.commits} commits)`).join(' · ')}`
      );
  }
  lines.push(...bridged);
  // §085 `unknownIdent` — the caller's cue to pay for §057's bounded never-parsed scan on a RANKED answer. Three
  // structural facts, no tunable among them:
  //   · the whole query is ONE word — this is an identifier lookup, not a sentence. It is also what makes the
  //     scan able to succeed at all: §057 matches the query's text VERBATIM, and a multi-word intent ("add rate
  //     limiting") essentially never appears verbatim in a config file, so scanning for it is pure cost.
  //     Measured on spec-kit before this clause: `unknownIdent` was true for 36.9% of commit-message queries and
  //     found something in 0% of them — the scan discipline §057 states ("every other query never opens a file
  //     at all") is kept by this line.
  //   · it is identifier-SHAPED (`qraw`: `tokenize` splits it in two, or it holds a `.`/`_`/`$`). A plain word is
  //     not, so `where users` never asks — and must not: answering a common word from code is correct, not a
  //     fabrication (40 of spec-kit's 51 "confident-wrong" rows are that, an artefact of instrument A's oracle).
  //   · no card's own `names` declares it (`anyExact`). A name the repo really has (`sendStatus`) is something
  //     grain is not blind to, so there is nothing to disclose and no file is opened.
  const oneWord = !/\s/.test(q.trim());
  return { lines, hits, cards, unknownIdent: oneWord && qraw.size > 0 && !anyExact, disclosures };
}
