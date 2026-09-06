// grain engine · the leave-one-out self-evaluations behind selftest --how, --where and --obligation
// Split out of core.mjs (ticket 117): the statements below are the ones that stood there, unchanged.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CFG } from './config.mjs';
import { refineModOf } from './relations.mjs';
import { normTok } from './cards.mjs';
import { currentPathOf } from './facts.mjs';
import { howCmd } from './how.mjs';
import { certifyObligationRules, classEventsOf, foldObligationFootprint } from './obligations.mjs';
import { tokenize } from './parse.mjs';
import { QSTOP, nameTokens } from './placement.mjs';
import { whereCmd } from './where.mjs';

// `selftest --how` (§J2.3) — a leave-one-out gate on `how`'s own evidence quality: for each of the last `last`
// real commits with >=2 files (a single-file commit gives leave-one-out nothing to hold out against — fps entries
// with 1 file, like a plain scaffold commit, still count toward the matching universe, they are just never
// EVALUATED as a candidate), rebuild the intent `how` would have seen from that commit's own tokens, and ask
// `how` to predict the commit's files using every OTHER commit as evidence — the commit itself is removed from
// the footprint universe first, or it would trivially "predict" its own files perfectly. A path/content grep over
// the same tokens is the naive baseline `how` is meant to beat.
// Truth and BOTH arms run over `model.pathsAll` (every tracked path, not only the code-parseable ones `filesAll`
// holds) so `how`'s wider file universe can never claim a recall win over files a grep baseline could never see.
// A candidate with zero predicted places, on either arm, still contributes P=0/R=0 to every mean/median —
// excluding "no match" cases would make the gate gameable by only ever answering the easy intents.
// Returns { how: {meanP, medP, meanR, medR}, grep: {meanP, medP, meanR, medR}, n, noMatch }: `n` is the candidate
// count, `noMatch` counts candidates where `how` predicted zero places (still included in `n` and every mean/median).
export function howEval({ model, H, root, last = 100 }) {
  const fps = (H && H.fps) || [];
  const pathsAll = model.pathsAll || model.filesAll || [];
  const live = new Set(pathsAll);
  const eligible = fps.filter(fp => fp.files.length >= 2 && fp.files.length <= CFG.megaCap);
  const n = Math.max(0, Math.floor(last) || 0);
  const candidates = n > 0 ? eligible.slice(-n) : []; // `fps` is oldest-first (history.mjs replay(), §J2.1) — the LAST n are the most recent

  // grep-baseline tokens, computed ONCE for the whole call (they do not depend on which commit is held out): a
  // path's basename tokens via `nameTokens`+`normTok` — the exact composition `howCmd` itself uses for path
  // tokens (core.mjs's `toksOfPath`) — and, for text files up to the same 1.5 MB cap `parseBlobs` applies to a
  // blob, its content tokenized and normTok'd the same way. Token-set intersection rather than a raw substring
  // test, so "handler" and "handling" count as the same hit whether the token came from a path or a line of code
  // — and so a stemmed intent token (already normTok'd, from `fp.toks`) compares against normTok'd content on
  // equal footing.
  const pathToks = new Map();
  const tokensOfPath = p => {
    let v = pathToks.get(p);
    if (v === undefined) {
      v = new Set(nameTokens(p).map(normTok));
      pathToks.set(p, v);
    }
    return v;
  };
  const contentToks = new Map();
  const tokensOfContent = p => {
    if (contentToks.has(p)) return contentToks.get(p);
    let v = null;
    try {
      const buf = readFileSync(join(root, p));
      // a NUL byte anywhere in the first 8KB is the same cheap binary heuristic git itself uses (core.diff.binary) —
      // good enough to keep an image/archive/etc. from being tokenized as text without a per-extension list
      if (buf.length <= 1.5e6 && buf.subarray(0, 8000).indexOf(0) === -1)
        v = new Set(tokenize(buf.toString('utf8')).map(normTok));
    } catch {
      /* deleted, unreadable, or not a plain file at this path — path tokens alone still apply */
    }
    contentToks.set(p, v);
    return v;
  };

  const prf = (predicted, truth) => {
    if (!predicted.size) return { p: 0, r: 0 }; // no prediction ⇒ P=0/R=0, never excluded
    let hit = 0;
    for (const f of predicted) if (truth.has(f)) hit++;
    return { p: hit / predicted.size, r: truth.size ? hit / truth.size : 0 };
  };

  const howP = [],
    howR = [],
    howF1 = [],
    grepP = [],
    grepR = [],
    grepF1 = [];
  let noMatch = 0;
  const f1 = (p, r) => (p + r ? (2 * p * r) / (p + r) : 0); // 0 when both P and R are 0 — a total miss is F1=0, not NaN
  for (const C of candidates) {
    const intent = C.toks.join(' '); // `C.toks` is already tokenize+normTok'd (history.mjs) — `howCmd` re-tokenizes the same words, a safe no-op
    const fps2 = fps.filter(fp => fp.sha !== C.sha); // leave-one-out: C must not be allowed to match itself
    const { places } = howCmd({ model, H: { ...H, fps: fps2 }, query: intent, shapes: false }); // the shape pass costs a buildCards() per call and this loop reads `places` only
    const predictedHow = new Set(places.filter(p => p.k >= 1).map(p => p.rel));
    const truth = new Set(C.files.filter(f => live.has(f))); // a leave-one-out truth check can't credit a file no longer alive at HEAD

    const intentToks = new Set(C.toks);
    const predictedGrep = new Set();
    if (intentToks.size)
      for (const p of pathsAll) {
        let hit = false;
        for (const t of tokensOfPath(p))
          if (intentToks.has(t)) {
            hit = true;
            break;
          }
        if (!hit) {
          const ct = tokensOfContent(p);
          if (ct)
            for (const t of intentToks)
              if (ct.has(t)) {
                hit = true;
                break;
              }
        }
        if (hit) predictedGrep.add(p);
      }

    if (!predictedHow.size) noMatch++;
    const h = prf(predictedHow, truth),
      g = prf(predictedGrep, truth);
    howP.push(h.p);
    howR.push(h.r);
    howF1.push(f1(h.p, h.r));
    grepP.push(g.p);
    grepR.push(g.r);
    grepF1.push(f1(g.p, g.r));
  }

  const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  const median = a => {
    if (!a.length) return 0;
    const s = [...a].sort((x, y) => x - y);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };
  // F1 (harmonic mean of P and R) alongside the frozen P/R criterion: a system that returns most of the repo
  // (grep) gets recall≈1 almost by construction, which makes "how's recall ≥ grep's recall" nearly unwinnable
  // for a precise tool regardless of how good it is — F1 penalizes over-returning and under-returning alike, so
  // it is not distorted by the two arms returning wildly different result-set sizes (§Bramka J2.3, gate re-run)
  return {
    how: {
      meanP: mean(howP),
      medP: median(howP),
      meanR: mean(howR),
      medR: median(howR),
      meanF1: mean(howF1),
      medF1: median(howF1),
    },
    grep: {
      meanP: mean(grepP),
      medP: median(grepP),
      meanR: mean(grepR),
      medR: median(grepR),
      meanF1: mean(grepF1),
      medF1: median(grepF1),
    },
    n: candidates.length,
    noMatch,
  };
}
// §069 (research/where-lever, `.system/research/where-ranking-design.md` §4.4) — leak subtraction for ANY
// history-reading lever a future `where` ranker might add. `howEval` just above protects itself cheaply: it
// drops the candidate commit from `fps` before handing history to `howCmd`, because `howCmd` matches directly
// against `H.fps` and nothing else. A future `where`-side lever (commit-message affinity, co-change propagation,
// a birth-place prior — the three measured on that research branch) needs the same protection, but over more of
// `H`: those three read `H.msgAff` / `H.msgTokCommits` / `H.fileCommits` / `H.nonMegaCommits` / `H.lc`'s birth
// records directly, not just `fps`. Left alone, such a lever sees the very commit that CREATED the candidate —
// that commit's message and file list ARE the ground truth `whereEval` is scoring against, so the lever
// "predicts" the answer from the question. Measured: a message-affinity lever scored `hit@3` 0.500 on
// openzeppelin with its own commit left in, 0.000 once subtracted — up to 2× inflation.
// Every field this function touches is a plain additive counter (one commit's contribution is exactly −1
// wherever it added +1), so subtracting one commit's contribution is exact, not an approximation — this is NOT
// true of `model.cochange` / `model.msgAffinity` (or `H.cochange` / `H.scopeCochange`, their un-pruned-by-model
// but still support/confidence-FILTERED cousins on `H` itself): those are gated by a support/confidence floor or
// an MDL cut applied before the aggregate is ever exposed, so subtracting one commit's contribution cannot
// restore a pair the floor already dropped, and reading them here would silently stay leaky. This function
// therefore strips `cochange`/`scopeCochange` from the returned object entirely — a lever that needs co-change
// must rebuild it from the (now leak-subtracted) `fps`, the same way `H.pairSup` was rebuilt into `H.cochange`
// in the first place, and a read of `.cochange` on the result throws instead of quietly returning leaky data.
// `whereEval` has no such lever wired in today (`whereCmd`'s score is purely lexical/structural — nothing here
// changes that), so this is currently unused by any product code path; it exists so the next lever cannot ship
// without the one property that makes this harness trustworthy for judging it.
export function leakSubtractedH(H, sha) {
  if (!H) return H;
  const self = (H.fps || []).find(fp => fp.sha === sha);
  const fps = (H.fps || []).filter(fp => fp.sha !== sha);
  if (!self) return { ...H, fps, cochange: undefined, scopeCochange: undefined };

  const msgAff = {};
  for (const [t, byFile] of Object.entries(H.msgAff || {})) msgAff[t] = { ...byFile };
  const msgTokCommits = { ...(H.msgTokCommits || {}) };
  const fileCommits = { ...(H.fileCommits || {}) };
  const dec = (obj, k) => {
    if (obj[k] == null) return;
    obj[k] -= 1;
    if (obj[k] <= 0) delete obj[k];
  };
  for (const t of self.toks) {
    if (msgAff[t]) {
      for (const f of self.files) dec(msgAff[t], f);
      if (!Object.keys(msgAff[t]).length) delete msgAff[t];
    }
    dec(msgTokCommits, t);
  }
  for (const f of self.files) dec(fileCommits, f);
  const nonMegaCommits = Math.max(0, (H.nonMegaCommits || 0) - 1);

  // birth records: `H.lc` (per-scope lifecycle) carries no sha (§13.3's lineage remap discards it), so a scope
  // born by THIS commit is identified the same way `whereEval`'s own truth derivation identifies it — the file
  // half of its key is one of `self.files` and its birth timestamp equals `self.ts`. Demoted to `newFile: false`
  // rather than deleted: every other lifecycle fact on the entry (mods/churn/author) still describes something
  // real, only "this commit is what created it" must go dark for evaluating this one candidate.
  let lc = H.lc;
  if (H.lc) {
    lc = new Map(H.lc);
    for (const [k, L] of lc)
      if (L.newFile && L.first === self.ts && self.files.includes(k.split('#')[0])) lc.set(k, { ...L, newFile: false });
  }

  return { ...H, fps, msgAff, msgTokCommits, fileCommits, nonMegaCommits, lc, cochange: undefined, scopeCochange: undefined };
}
// `selftest --where` (§J2.3's sibling gate) — the same automatically-derived ground truth `selftest --how` runs
// on (real commits), asked the other question. `how` grades a prediction of which files an intent TOUCHES;
// `where` answers "where do such things live, what is expected there, which exemplar to copy", and a commit that
// ADDED a file is this repository's own recorded answer to exactly that: the message says what was wanted, the
// file that resulted is where the answer landed. Each such commit is therefore one (query, relevant file) pair
// labelled by the repository itself — no hand-labelling, no external notion of good structure — and `where` is
// scored as a RANKER over its own cards rather than as a set predictor.
//   · query — the commit's own message tokens, the identical derivation `howEval` feeds `how` (`fp.toks`), so the
//     two harnesses can never drift on what an "intent" is. Nothing is stripped, cleaned or re-weighted here: a
//     harness that pre-processes the query measures a pre-processor that does not ship.
//   · truth — the files that commit ADDED, followed through later renames to the path they carry at HEAD. Birth
//     comes from `H.lc`, the per-scope lifecycle: its `newFile` flag records the add, and `lc` spans the WHOLE
//     history, so a file born in a bulk commit (never in `fps`, §J2.1's megaCap) is correctly left out instead of
//     being mistaken for born at the first small commit that happens to touch it. Truth is narrowed to
//     `model.filesAll` — a file grain never indexed has no card and no path either arm can rank, so grading it
//     would measure the indexer, not the ranking — and BOTH arms are narrowed to that same universe, so neither
//     can win or lose on index coverage (the mirror of `howEval`'s widening to `pathsAll` for the same reason).
//   · baseline — the naive ranker the card machinery has to be worth more than: every indexed path, ordered by
//     how many distinct query tokens its own path carries. Content is deliberately NOT read (unlike `howEval`'s
//     set-valued grep arm): ranking by content-token overlap ranks by file size, since a longer file contains
//     more distinct words — an artifact, not a baseline.
//   · two readings, both arms — `hit` credits an answer only when it names the born file itself; `place` also
//     credits an answer that merely CONTAINS it (a directory card it sits under, a role group or marker whose
//     members include it — whose "carriers to copy" are then literally the new file's peers), and for the
//     baseline, a ranked path from the same directory. `where` deliberately ranks a directory or group above a
//     bare file (`rank()` above), so grading it on file cards alone would grade a design decision as a defect.
//   · two strata — a commit message very often contains the words of the file it created ("add bson render"), and
//     a name matcher wins those on the name alone. `unnamed` re-runs the identical scoring over only those
//     candidates where NO born file's own name (`nameTokens`, the repo's own "what does this name say") shares a
//     token with the query: the half no name matcher can win, reported BESIDE the pooled numbers, never instead
//     of them. Together with the baseline arm that is two independent controls on the one confound this ground
//     truth cannot remove — the query and the answer were written by the same person in the same sitting.
//   · a third, additive stratum (§071) — every query above is built from `toks`, the commit message run through
//     `tokenize`+`normTok`, which SPLITS camelCase/snake_case (`sendStatus` → `send`+`status`) — so none of them
//     can ever contain a verbatim identifier, and `whereCmd`'s own exact-name pin (`qraw`/`c.exact`) can only ever
//     fire off a query's own whole, unsplit word. That is an instrument boundary, not a fact about `where`: typed
//     by a human, `where sendStatus` pins correctly. `symbol` re-runs the identical scoring over just the
//     candidates whose raw message carried such a word (`fp.symToks`, history.mjs), on a query that keeps it
//     whole ALONGSIDE the ordinary split form — never replacing `where`/`base`/`unnamed` above, which stay
//     computed exactly as before.
// Returns { where, base, unnamed: { n, where, base }, symbol: { n, where, base }, n, silent }, each arm
// { hit3, mrr, place3, placeWidth }: `n` is the candidate count, `silent` counts candidates where `where` ranked
// nothing at all (a genuine no-match or the concentration safeguard suppressing an untrustworthy top hit — both
// still count as a 0, or the gate would be gameable by staying quiet on everything hard). `place3` discounts a
// containment-only credit by 1/cardWidth (§068) so a directory or group wide enough to cover most of the
// repository cannot pass as a precise hit; `placeWidth` is the mean file-count of the cards actually credited,
// printed beside place3 so that artifact is visible directly instead of requiring a researcher to dig it out by
// hand.
export function whereEval({ model, H, last = 100 }) {
  const DEPTH = 10; // the ranked list is read this deep: `hit3`/`place3` are the product's OWN default `--top 3`; the rest of the depth is there so `mrr` can tell "just missed" from "nowhere at all"
  const fps = (H && H.fps) || [];
  const filesAll = model.filesAll || [];
  const live = new Set(filesAll);
  // a file's birth: the earliest commit any of its scopes was first seen in, and whether that commit ADDED the
  // file. `lc` keys carry the file's CURRENT path (replay() moves a renamed file's rows, §13.3), so this map is
  // keyed by the path the file has at HEAD.
  const birth = new Map();
  for (const [k, L] of (H && H.lc) || []) {
    const rel = k.split('#')[0];
    if (!live.has(rel)) continue;
    const cur = birth.get(rel);
    if (!cur || L.first < cur.ts) birth.set(rel, { ts: L.first, added: !!L.newFile });
    else if (L.first === cur.ts && L.newFile) cur.added = true;
  }
  // the same lineage in the other direction: `fps[*].renames` maps a historical path to what it became, so the
  // commit that added `flask/config.py` is still credited with the file living at `src/flask/config.py` today.
  // Bounded walk — a rename cycle (A→B in one commit, B→A in another) must not spin.
  const renamedTo = new Map();
  for (const fp of fps) for (const [o, nw] of fp.renames || []) renamedTo.set(o, nw);
  const finalPath = p => {
    let x = p;
    for (let i = 0; i < 64 && renamedTo.has(x); i++) {
      const y = renamedTo.get(x);
      if (y === x) break;
      x = y;
    }
    return x;
  };
  const claimed = new Set();
  const eligible = [];
  for (const fp of fps) {
    // `fps` is oldest-first (history.mjs replay(), §J2.1) — on a timestamp tie the earlier commit keeps the file
    const truth = [];
    for (const f of fp.files) {
      const cur = finalPath(f);
      if (claimed.has(cur)) continue;
      const b = birth.get(cur);
      if (b && b.added && b.ts === fp.ts) {
        truth.push(cur);
        claimed.add(cur);
      }
    }
    if (truth.length) eligible.push({ toks: fp.toks, symToks: fp.symToks || [], truth });
  }
  const n = Math.max(0, Math.floor(last) || 0);
  const candidates = n > 0 ? eligible.slice(-n) : []; // the LAST n are the most recent — the conventions in force now

  const pathToks = new Map();
  const tokensOfPath = p => {
    let v = pathToks.get(p);
    if (v === undefined) {
      v = new Set(tokenize(p).map(normTok));
      pathToks.set(p, v);
    }
    return v;
  };
  const dirOf = p => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '.');
  // §068 — `place` was gameable by card width: a directory or group card wide enough to cover most of the
  // repository contains the truth file almost by construction, so crediting it the same 1 a precise hit earns
  // measures the harness's own leniency, not the ranker (found live: a candidate "card" was 64% of its repo).
  // `cardWidth` is the number of DISTINCT files the credited card actually spans — a directory's own `files`
  // list, or the distinct file paths behind a group/marker's member scopes — with no reference to total repo
  // size and no tunable cutoff: a card of its own single file (== a `hit`) is width 1 and keeps full credit: the
  // discount is purely the card's own composition, structurally derived, never a hardcoded number.
  const cardWidth = h => {
    if (h.type === 'directory') return (h.files && h.files.length) || 1;
    const files = new Set((h.members || []).map(k => String(k).split('#')[0]));
    return files.size || 1;
  };
  // the naive baseline's own notion of a "card" is a ranked file's immediate directory — precomputed once since
  // it depends only on `filesAll`, not on any one candidate — so the same 1/width discount can be applied to
  // BOTH arms and the two place@3 numbers stay comparable rather than one being graded on a coarser curve
  const dirFileCount = new Map();
  for (const p of filesAll) {
    const d = dirOf(p);
    dirFileCount.set(d, (dirFileCount.get(d) || 0) + 1);
  }
  // §071 — the per-candidate scoring math, unchanged in every particular from before this ticket, pulled out to
  // a function so it can be reused verbatim for a SECOND query built off the same candidate (the symbol stratum
  // below) without duplicating (and risking drift in) the arithmetic the pooled/unnamed strata are judged by.
  // Called once per candidate exactly as the inline loop used to call it — same query, same truth, same DEPTH —
  // so the pooled/named/unnamed numbers this returns are bit-for-bit what the old inline code produced.
  const scoreQuery = (C, query) => {
    const qt = new Set(
      tokenize(query)
        .map(normTok)
        .filter(t => !QSTOP.has(t))
    ); // derived from the query STRING by `whereCmd`'s own two steps, so the baseline arm and the stratum split can never see a different set of words than `where` itself does
    const truth = new Set(C.truth),
      truthDirs = new Set(C.truth.map(dirOf));
    const { hits } = whereCmd({ model, query, top: DEPTH, mapRows: 0 }); // mapRows 0: the compact map is render-only and this reads ranks
    let wHit = 0,
      wPlace = 0,
      wContainRank = 0,
      wContainWidth = 0;
    hits.forEach((h, i) => {
      const hit = h.type === 'file' && truth.has(h.label);
      const contain =
        h.type === 'directory'
          ? C.truth.some(t => t.startsWith(h.label))
          : (h.members || []).some(k => truth.has(String(k).split('#')[0]));
      if (hit && !wHit) wHit = i + 1;
      if ((hit || contain) && !wPlace) wPlace = i + 1;
      if (contain && !hit && !wContainRank) {
        wContainRank = i + 1;
        wContainWidth = cardWidth(h);
      }
    });
    // an actual hit inside top@3 is never discounted — the file that NAMES the answer is exactly what "place"
    // was always meant to reward at full value; only a place earned purely by CONTAINMENT (no card named the
    // file, one merely happened to be wide enough to include it) is worth 1/cardWidth, and only when no real
    // hit also landed inside the same top-3 window
    const wPlaceW = wHit && wHit <= 3 ? 1 : wContainRank && wContainRank <= 3 ? wContainWidth : 0;
    const wPlaceCredit = wHit && wHit <= 3 ? 1 : wContainRank && wContainRank <= 3 ? 1 / wContainWidth : 0;
    const ranked = [];
    for (const p of filesAll) {
      const pt = tokensOfPath(p);
      let m = 0;
      for (const t of qt) if (pt.has(t)) m++;
      if (m) ranked.push([p, m]);
    }
    // deliberately naive and fully deterministic: more matched words first, then the shorter path (the more
    // specific of two equal matches), then lexical — no relevance model of any kind, that is the arm being beaten
    ranked.sort((a, b) => b[1] - a[1] || a[0].length - b[0].length || (a[0] < b[0] ? -1 : 1));
    let bHit = 0,
      bContainRank = 0,
      bContainWidth = 0;
    ranked.slice(0, DEPTH).forEach(([p], i) => {
      const hit = truth.has(p);
      const contain = truthDirs.has(dirOf(p));
      if (hit && !bHit) bHit = i + 1;
      if (contain && !hit && !bContainRank) {
        bContainRank = i + 1;
        bContainWidth = dirFileCount.get(dirOf(p)) || 1;
      }
    });
    const bPlaceW = bHit && bHit <= 3 ? 1 : bContainRank && bContainRank <= 3 ? bContainWidth : 0;
    const bPlaceCredit = bHit && bHit <= 3 ? 1 : bContainRank && bContainRank <= 3 ? 1 / bContainWidth : 0;
    return { qt, silent: !hits.length, wHit, wPlaceCredit, wPlaceW, bHit, bPlaceCredit, bPlaceW };
  };
  const rows = [];
  let silent = 0;
  for (const C of candidates) {
    const query = C.toks.join(' ');
    const r = scoreQuery(C, query);
    if (r.silent) silent++;
    const nameToks = new Set(C.truth.flatMap(f => nameTokens(f).map(normTok)));
    rows.push({
      named: [...r.qt].some(t => nameToks.has(t)),
      wHit: r.wHit,
      wPlaceCredit: r.wPlaceCredit,
      wPlaceW: r.wPlaceW,
      bHit: r.bHit,
      bPlaceCredit: r.bPlaceCredit,
      bPlaceW: r.bPlaceW,
    });
  }
  // §071 — the symbol stratum: purely additive, never read by (and never feeding back into) `rows` above, so it
  // cannot move the pooled/named/unnamed numbers by so much as a rounding error. Limited to candidates whose OWN
  // commit message actually contained a verbatim identifier-shaped word (`symToks`, history.mjs) — a candidate
  // with none would score identically to its own `rows` entry, diluting the stratum with cases that test nothing
  // new. The query fed to `whereCmd` is the existing split/stemmed form PLUS those verbatim words appended (never
  // instead of it — option (a) from the ticket): `qraw`/`c.exact` (core.mjs's exact-name pin) can only ever fire
  // off a query's own WHOLE, unsplit word, and `toks` alone can never contain one.
  const symRows = [];
  for (const C of candidates) {
    if (!C.symToks.length) continue;
    const query = [...C.toks, ...C.symToks].join(' ');
    const r = scoreQuery(C, query);
    symRows.push({ wHit: r.wHit, wPlaceCredit: r.wPlaceCredit, wPlaceW: r.wPlaceW, bHit: r.bHit, bPlaceCredit: r.bPlaceCredit, bPlaceW: r.bPlaceW });
  }

  const at = (rs, f, k) => (rs.length ? rs.filter(r => r[f] && r[f] <= k).length / rs.length : 0);
  const mrr = (rs, f) => (rs.length ? rs.reduce((a, r) => a + (r[f] ? 1 / r[f] : 0), 0) / rs.length : 0);
  // place@3 is now the MEAN of each row's (already rank- and width-resolved) credit rather than a share of
  // nonzero ranks — a strict generalization: every row that used to contribute 1 (a real hit within top@3)
  // still contributes exactly 1, so place3 can still never fall below hit3, it can only stop being inflated by
  // wide, uninformative cards
  const place3 = (rs, credit) => (rs.length ? rs.reduce((a, r) => a + r[credit], 0) / rs.length : 0);
  // the credited card's own width, reported beside place@3 so a future researcher sees a gameable-by-width
  // artifact (a card covering most of the repo) directly in the harness output instead of rediscovering it by
  // hand — averaged over the rows that actually earned place credit; 0 when none did
  const placeWidth = (rs, credit, width) => {
    const credited = rs.filter(r => r[credit] > 0);
    return credited.length ? credited.reduce((a, r) => a + r[width], 0) / credited.length : 0;
  };
  const arm = (rs, h, credit, width) => ({
    hit3: at(rs, h, 3),
    mrr: mrr(rs, h),
    place3: place3(rs, credit),
    placeWidth: placeWidth(rs, credit, width),
  });
  const unnamed = rows.filter(r => !r.named);
  return {
    where: arm(rows, 'wHit', 'wPlaceCredit', 'wPlaceW'),
    base: arm(rows, 'bHit', 'bPlaceCredit', 'bPlaceW'),
    unnamed: {
      n: unnamed.length,
      where: arm(unnamed, 'wHit', 'wPlaceCredit', 'wPlaceW'),
      base: arm(unnamed, 'bHit', 'bPlaceCredit', 'bPlaceW'),
    },
    // §071 — candidates whose commit message carried at least one verbatim identifier-shaped word, scored on a
    // query that keeps that word whole (alongside the ordinary split/stemmed tokens): the stratum `unnamed`
    // structurally cannot cover, since a query built only from `toks` can never pin `whereCmd`'s exact-name match.
    symbol: {
      n: symRows.length,
      where: arm(symRows, 'wHit', 'wPlaceCredit', 'wPlaceW'),
      base: arm(symRows, 'bHit', 'bPlaceCredit', 'bPlaceW'),
    },
    n: rows.length,
    silent,
  };
}
// `selftest --obligation` (ticket 073's instrument) — the same automatically-derived, leave-one-out ground truth
// `selftest --how`/`selftest --where` already run (a past commit IS a recorded answer; nobody labels anything),
// asked of the birth-obligation table. Stricter than those two siblings' own leave-one-out, though: `howEval`/
// `whereEval` drop only the ONE candidate commit and still let LATER commits inform the model that scores an
// EARLIER candidate. Here the table scoring a candidate is built ONLY from strictly-older footprints, walked
// forward chronologically and folded in one at a time via `foldObligationFootprint` (above) — the exact function
// `buildObligationTable` itself calls, so the gates a shipped `grain obligation` answer clears can never drift
// from the gates this harness measures. The candidate's own footprint is folded in only AFTER it is scored, so it
// can never certify the very rule being used to predict it — the prospective analogue of `leakSubtractedH`'s
// discipline (§069), guarded by its own test the same way ticket 069 guards `whereEval`.
//
// One EVENT is one (footprint, class) pair, not one commit — a commit adding files in two different classes is
// two events, matching the unit `grain obligation <path>` itself answers for one path at a time.
//
// "hottest recent files" (the non-obvious stratum, and null (a)) is read off the SAME running `fileCommits`
// accumulator the table itself uses for its base-rate contrast — the top 10 by cumulative touch count as of the
// candidate's own position in history, never a repo-wide or all-time count a candidate could not yet have earned.
export function obligationEval({ model, H, last = 100 }) {
  const fps = (H && H.fps) || [];
  const live = new Set([...(model.pathsAll || []), ...(model.filesAll || [])]);
  const refinedM = model._archModOf || (model._archModOf = refineModOf(model.filesAll || [], model.pkgs || [], model.srcRoots || []));
  const currentOf = currentPathOf(fps, live);

  const allEvents = [];
  for (let i = 0; i < fps.length; i++)
    for (const ev of classEventsOf(fps[i], { currentOf, refinedM })) allEvents.push({ i, ...ev });
  const n = Math.max(0, Math.floor(last) || 0);
  const candidates = n > 0 ? allEvents.slice(-n) : []; // events are already chronological (fps is oldest-first, §J2.1) — the LAST n are the most recent
  const byIndex = new Map();
  for (const c of candidates) {
    if (!byIndex.has(c.i)) byIndex.set(c.i, []);
    byIndex.get(c.i).push(c);
  }

  // a small, deterministic LCG seeded per event — reproducible across runs (same H, same `last`) without needing
  // a shared, stateful Math.random; this is instrument-internal (the null (b) baseline), never product code.
  const seededPick = (arr, kCount, seed) => {
    if (arr.length <= kCount) return arr.slice();
    let s = (seed >>> 0) || 1;
    const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
    const pool = arr.slice();
    const out = [];
    for (let j = 0; j < kCount && pool.length; j++) out.push(pool.splice(Math.floor(rnd() * pool.length), 1)[0]);
    return out;
  };

  const classes = new Map();
  const fileCommits = new Map();
  const rows = [];
  for (let i = 0; i < fps.length; i++) {
    const fp = fps[i];
    const evs = byIndex.get(i);
    if (evs && evs.length) {
      let universe = 0;
      for (const rec of classes.values()) universe += rec.co.size;
      const idxCost = Math.ceil(Math.log2(Math.max(universe, 2)));
      const nonMegaCommits = i; // exactly the number of footprints folded in so far — the population `fileCommits` below was drawn from
      const truthAll = new Set(fp.files.map(currentOf));
      const hotPool = [...fileCommits.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
      for (const ev of evs) {
        const truth = new Set(truthAll);
        truth.delete(ev.cur);
        const rec = classes.get(ev.key);
        const rules = rec ? certifyObligationRules(rec, { fileCommits, nonMegaCommits, idxCost, live }).rules : [];
        const fired = rules.length > 0;
        const top1 = fired ? rules[0].file : null;
        const top3 = rules.slice(0, 3).map(r => r.file);
        const hit1 = fired && truth.has(top1);
        const hit3n = top3.filter(f => truth.has(f)).length;
        const prec3 = top3.length ? hit3n / top3.length : 0;
        const hot10 = new Set(hotPool.filter(([f]) => f !== ev.cur).slice(0, 10).map(([f]) => f));
        const nonObvious = fired && !hot10.has(top1);
        const hot3 = hotPool.filter(([f]) => f !== ev.cur).slice(0, 3).map(([f]) => f);
        const nullHotHit = hot3.some(f => truth.has(f));
        const alive = [...fileCommits.keys()].filter(f => f !== ev.cur && live.has(f));
        const nullRand = seededPick(alive, 3, i * 2654435761 + rows.length + 1);
        const nullRandHit = nullRand.some(f => truth.has(f));
        rows.push({ fired, hit1, prec3, nonObvious, nonObviousHit: nonObvious && hit1, nullHotHit, nullRandHit });
      }
    }
    foldObligationFootprint(fp, { currentOf, refinedM, classes, fileCommits });
  }

  const share = (rs, pred) => (rs.length ? rs.filter(pred).length / rs.length : 0);
  const fired = rows.filter(r => r.fired);
  const nonObv = rows.filter(r => r.nonObvious);
  return {
    n: rows.length,
    coverage: share(rows, r => r.fired),
    precision1: share(fired, r => r.hit1),
    precision3: fired.length ? fired.reduce((a, r) => a + r.prec3, 0) / fired.length : 0,
    nonObviousN: nonObv.length,
    nonObviousPrecision: share(nonObv, r => r.nonObviousHit),
    nullHot: share(fired, r => r.nullHotHit),
    nullRandom: share(fired, r => r.nullRandHit),
  };
}
