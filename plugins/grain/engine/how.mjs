// grain engine · howCmd — intent to the past commits that look like it
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { refineModOf } from './relations.mjs';
import { normTok } from './cards.mjs';
import { missingLines } from './completeness.mjs';
import { archCellLabel, currentPathOf } from './facts.mjs';
import { voice } from './mine.mjs';
import { tokenize } from './parse.mjs';
import { QSTOP, nameTokens, sufOf } from './placement.mjs';
import { whatCmd } from './what.mjs';
import { whereCmd } from './where.mjs';

// `how <intent>` — change by example (§J2.2). `where` answers "what governs the place this belongs in"; `how`
// answers a different question — "when a change like this happened here before, which files did it touch?" — and
// answers it only from real commits (`H.fps`, recorded by J2.1). Every match is one historical instance cited by
// its sha, never a certified convention, and the header says so in the map voice.
export function howCmd({
  model,
  H,
  query,
  top = 5,
  msgOf = null,
  mapRows = 60,
  exemplarOk = () => true,
  shapes = true,
}) {
  const q = query;
  const qt = new Set(tokenize(q).map(normTok));
  for (const t of [...qt]) if (QSTOP.has(t)) qt.delete(t); // instruction fillers never count — same cut whereCmd makes
  const fps = (H && H.fps) || [];
  // path tokens per DISTINCT path, memoized: the same file recurs across many commits, and `nameTokens`
  // re-tokenizes its basename every time otherwise (measured: the memo is worth ~2x at CFG.fpsCap)
  const pathToks = new Map();
  const toksOfPath = p => {
    let v = pathToks.get(p);
    if (v === undefined) {
      v = nameTokens(p).map(normTok);
      pathToks.set(p, v);
    }
    return v;
  };
  const carries = (fp, t) => {
    if (fp.toks.includes(t)) return true; // message tokens and file-name tokens are one set, checked without building it
    for (const f of fp.files) if (toksOfPath(f).includes(t)) return true;
    return false;
  };
  // document frequency over exactly the universe the match runs on: one commit counts once per token, whether that
  // token came from its message or from one of its file names. `H.msgTokCommits` is deliberately NOT reused here —
  // it counts only commits that HAVE a message (fps holds message-less ones too) and knows nothing of path tokens,
  // so pairing it with a path-side df would weigh the two halves of one token set on two different denominators.
  // Counted for the QUERY's tokens only: df for every token the whole history ever said is work thrown away, and
  // it is what would have forced a persisted `fpsPathDf` field (and a MODEL_V bump) to stay inside the latency
  // budget. Scoped this way the pass costs one walk of `fps` per query word, with no per-commit allocation at all.
  const df = new Map();
  for (const t of qt) {
    let n = 0;
    for (const fp of fps) if (carries(fp, t)) n++;
    df.set(t, n);
  }
  const N = fps.length;
  const maxIdf = Math.log2(1 + N); // a query word no commit ever said stays in the denominator at full weight
  const idf = new Map();
  for (const t of qt) idf.set(t, df.get(t) ? Math.log2(1 + N / df.get(t)) : maxIdf);
  const idfSum = [...idf.values()].reduce((a, b) => a + b, 0);
  const scored = [];
  if (idfSum)
    for (const fp of fps) {
      let s = 0;
      for (const [t, w] of idf) if (carries(fp, t)) s += w;
      const score = s / idfSum;
      if (score >= 0.34) scored.push({ fp, score });
    } // the same "weak match" floor whereCmd warns at — here it is the cut, not a caveat
  // ranking: score first; ties broken by RECENCY (the newest instance is the one to copy — a repo's own habits
  // drift, and the oldest of three identical-scoring commits is the least likely to still be how it is done), then
  // by sha so two runs on one repository can never disagree
  scored.sort(
    (a, b) =>
      b.score - a.score || b.fp.ts - a.fp.ts || (a.fp.sha < b.fp.sha ? -1 : a.fp.sha > b.fp.sha ? 1 : 0)
  );
  const matches = scored.slice(0, Math.max(1, Math.floor(top) || 5));
  if (!matches.length) {
    // nothing invented: fall back to whereCmd's own compact map, whole and unmodified
    const { lines: mapLines } = whereCmd({ model, query: q, mapRows, exemplarOk });
    return {
      lines: [
        voice(
          'map',
          `«${q}» → no past change matches this intent — there is no example to follow, so the structural map of this repository follows instead`
        ),
        ...mapLines,
      ],
      matches: [],
      places: [],
      missing: [],
      shape: null,
    };
  }
  const K = matches.length;
  const msgFor = fp => {
    const m = msgOf ? msgOf(fp.sha) : null;
    return m || (fp.toks.length ? fp.toks.join(' ') : '(no commit message)');
  };
  const refined =
    model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || [], model.srcRoots || []));
  const live = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]); // every path alive at HEAD, code or not — `fp.files` spans both
  const currentOf = currentPathOf(fps, live);
  // counted on the CURRENT path, so a file renamed inside the match window is one place at k/K, not two half-places
  // — and deduplicated per commit, because the renaming commit itself lists both of its own sides in `files`.
  // `weights` mirrors `counts` exactly (same dedup, same loop) but accumulates each contributing match's OWN
  // `score` instead of 1 — the matcher already computed that score; this is the only place downstream of it that
  // discarded it (§005). `k`/`of` keep their exact original meaning (a raw commit count) since `howEval`'s §J2.3
  // gate and `how-hook`'s `p.k >= 2` filter (grain.mjs) both read `k` as that count — only the SORT ORDER changes,
  // ranking by the strength of the commits that contributed a place rather than by how many happened to. A place
  // touched once by a 0.9-score commit now outranks one touched once by a 0.35-score commit, where before both
  // tied on k=1 and fell back to alphabetical order — no new tuned constant, just the score the matcher already produced.
  const counts = new Map();
  const weights = new Map();
  for (const m of matches) {
    const once = new Set();
    for (const f of m.fp.files) {
      const cur = currentOf(f);
      if (once.has(cur)) continue;
      once.add(cur);
      counts.set(cur, (counts.get(cur) || 0) + 1);
      weights.set(cur, (weights.get(cur) || 0) + m.score);
    }
  }
  const topScopes = new Map(); // the scopes the TOP-ranked match itself changed, per file — one example's shape, not a tally
  for (const key of matches[0].fp.scopes || []) {
    const parts = key.split('#');
    if (parts.length < 3) continue;
    const cur = currentOf(parts[0]);
    const arr = topScopes.get(cur) || [];
    if (!arr.includes(parts[2])) arr.push(parts[2]);
    topScopes.set(cur, arr);
  }
  let places = [...counts.keys()]
    .map(rel => ({
      rel,
      k: counts.get(rel),
      of: K,
      module: refined(rel),
      exists: live.has(rel),
      scopes: (topScopes.get(rel) || []).slice(0, 6),
      weight: +weights.get(rel).toFixed(3),
    }))
    .sort((a, b) => b.weight - a.weight || b.k - a.k || (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  // §066: a place dead at HEAD is dead code to an agent following this list — never somewhere to edit. Same
  // liveness source `cochangeData` computes its own `live` set from (core.mjs ~9154, one house-wide answer to "is
  // this path still here", never a second/third liveness check invented per renderer). §020 had this render
  // `(deleted)` instead of dropping the entry; measured on a real corpus that still put 13 of 28 CleanArchitecture
  // places on files that no longer exist — marking a dead file still hands it to the reader as a "place such a
  // change touched". Omitting it is the other option the ticket's own acceptance text always allowed ("marks it OR
  // omits it — decide which and document why"); dropping is strictly the more useful answer for an agent about to
  // edit code, so `how` now omits rather than marks.
  places = places.filter(p => p.exists);
  // §066: the "1/N" long tail — a place touched by only 1 of K matched commits is one anecdote, not a place "such
  // a change touched". Reuses `how-hook`'s own existing bar for exactly this (`places.filter(p => p.k >= 2)`,
  // grain.mjs) rather than a new constant. Applied only when it leaves something: a single-match query (K=1) or a
  // set of equally-thin matches has no k>=2 evidence to prefer over, and dropping to zero places would be a false
  // "nothing to say" — the same refusal-to-invent-absence principle as `completenessDirectional` (§063).
  const strongPlaces = places.filter(p => p.k >= 2);
  if (strongPlaces.length) places = strongPlaces;
  // `sources: ['cochange']` is the ONLY correct configuration here and is not a limitation to relax later: `how`
  // names its files from the commit history and never parses one, so it can never supply the `newFileScopes` the
  // `'recipe'` source needs. Bolting `'recipe'` on would require adding a parse step first.
  const missing = missingLines(model, places.map(p => p.rel), { sources: ['cochange'] });
  // the certified SHAPE this intent looks like, if any (§J4.1). Two independent readings of the same query: the
  // archetype's own message vocabulary, scored on the idf already computed above, and how much of its certified
  // module/suffix footprint the places `what` finds for this query cover (a `g:` role cell has no query-side
  // analogue without parsing, so coverage is read over `m:`/`k:` alone). The stronger reading decides, on the same
  // 0.34 weak-match floor the commit matcher itself cuts at.
  let shape = null;
  if (shapes && (model.changeArchetypes || []).length && idfSum) {
    const qCells = new Set();
    // `whatCmd` now returns its own (a)∪(b) file set. §039: this used to be rebuilt here from the two published
    // halves, and `defined` among them is DISPLAY-CAPPED at 12 — so on any query with more than twelve declaration
    // hits the cover ratio below was computed against a truncated footprint and came out too low, which can push a
    // genuinely-matching archetype under the 0.34 floor and silence a certified shape entirely. Same defect class
    // as §036: a display cap deciding a verdict. It still costs a `buildCards(model)` that `how` otherwise never
    // pays — which is why `howEval` turns this whole pass off: it reads `places` only, and runs `howCmd` once per
    // candidate commit.
    const qFiles = new Set(whatCmd({ model, H: null, query: q, exemplarOk }).spreadFiles);
    for (const f of qFiles) {
      qCells.add('m:' + refined(f));
      const sf = sufOf(f);
      if (sf) qCells.add('k:' + sf);
    }
    let best = null;
    for (const a of model.changeArchetypes) {
      let s = 0;
      for (const [t, w2] of idf) if (a.toks.includes(t)) s += w2;
      const cert = a.cells.filter(c => c.certified);
      const mk = cert.filter(c => c.cell[0] === 'm' || c.cell[0] === 'k');
      const cover = mk.length ? mk.filter(c => qCells.has(c.cell)).length / mk.length : 0;
      const score = Math.max(s / idfSum, cover);
      if (score >= 0.34 && (!best || score > best.score || (score === best.score && a.n > best.a.n)))
        best = { a, score, cert };
    }
    if (best) shape = { id: best.a.id, label: best.a.label, n: best.a.n, cells: best.cert };
  }
  const lines = [
    voice(
      'map',
      `«${q}» → how such a change runs here: ${K} past change${K === 1 ? '' : 's'} match (evidence: ${shape ? 'a certified shape, then examples' : 'examples, not a certified shape'})`
    ),
  ];
  if (shape)
    lines.push(
      voice(
        'practiced',
        `certified shape "${shape.label}" (${shape.n} changes): ${shape.cells.map(c => `${archCellLabel(model, c.cell)} (${c.k} of ${shape.n})`).join(' · ')}`
      )
    );
  for (const m of matches)
    lines.push(
      voice('example', `"${msgFor(m.fp)}" — ${m.fp.files.length} file${m.fp.files.length === 1 ? '' : 's'}`, {
        sha: m.fp.sha.slice(0, 7),
        date: new Date(m.fp.ts * 1000).toISOString().slice(0, 7),
      })
    );
  // §066: `places` is already filtered to files live at HEAD (above) — every remaining entry's `exists` is true,
  // so there is no longer a `(deleted)` branch to render here. A places array can now legitimately be empty (every
  // file the matched commits touched has since been deleted) — the header is only worth printing when there is at
  // least one place to list under it.
  if (places.length) {
    lines.push('places such a change touched:');
    for (const p of places)
      lines.push(
        `  ${p.rel} (${p.k}/${p.of}) — ${p.module}${p.scopes.length ? ` · scopes: ${p.scopes.join(', ')}` : ''}`
      );
  }
  lines.push(...missing);
  return {
    lines,
    matches: matches.map(m => ({
      sha: m.fp.sha,
      ts: m.fp.ts,
      msg: msgFor(m.fp),
      files: m.fp.files,
      score: +m.score.toFixed(3),
    })),
    places,
    missing,
    shape,
  };
}
