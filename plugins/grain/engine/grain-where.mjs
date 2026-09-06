// grain engine · query surface · `where` and `how`, and the bounded raw-text hedges they fall back on
// Split out of grain.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { whereCmd, howCmd, blindFiles, ungrammaredFiles, verbalize, scopeLine, part } from './core.mjs';
import { loadHistory } from './history.mjs';
import { DIRTY_TREE_NOTE } from './core.mjs';
import { existsMemo, log } from './grain-context.mjs';
import { signal } from './grain-report.mjs';

// ----- commands -----
export async function cmdWhere({ model, root, args, opts, stamp, treeDirty }) {
  if (!args.length) throw new Error('usage: grain where <intent words>');
  const query = args.join(' ');
  const whereArgs = { model, query, top: +opts.top || 3, mapRows: +opts['map-rows'] || 60, exemplarOk: existsMemo(root) };
  let { lines, hits, unknownIdent, disclosures } = whereCmd(whereArgs);
  // §057 — a zero-hit answer reads as "this concept isn't in the repository". Before accepting that, a bounded
  // scan (never a repo-wide grep) checks whether the query's exact text lives, verbatim, in a tracked file grain
  // never had a grammar for at all — a stronger, cheaper, deterministic sibling of the peer-anomalous blind-file
  // hedge `what` already carries. Only paid when `hits` is already empty, same discipline as `cmdWhat` below.
  //
  // §085 adds the ONE other path that pays for it, and no more: a RANKED answer to an identifier the parsed
  // model never declares (`unknownIdent`). Measured on 4 repos, that is where every silent confident-wrong
  // absence claim lives — `tokenize` splits `indent_style` into `indent`+`style`, both of which occur in real
  // code, so hits are non-empty, `lex0 > 0`, and neither §057 above nor §070's zero-foothold banner can fire
  // while the whole ranking is assembled from fragments of a name grain has never seen. Every other query —
  // plain words, and every identifier the repo actually declares — still opens no file at all.
  if (!hits.length || unknownIdent) {
    const ungrammaredHit = findUngrammaredHit(model, root, query);
    if (ungrammaredHit) ({ lines, hits, disclosures } = whereCmd({ ...whereArgs, ungrammaredHit }));
  }
  const sig = signal(model);
  // §089 — same register as whereCmd's own hedges above: a sparse/empty/partitionless model means the ranked
  // answer below rests on very little, which is exactly the kind of thing an agent reading JSON must not miss.
  // `kind` is derived from `sig.verdict`'s own existing category words, not a new name.
  if (/empty|sparse|no source/.test(sig.verdict)) {
    const text = `model note: ${sig.facts} conventions over ${sig.files} source files — ${sig.verdict}`;
    lines.push(text);
    const kind = /no source/.test(sig.verdict)
      ? 'no-source-partition'
      : /empty/.test(sig.verdict)
        ? 'empty-model'
        : 'sparse-model';
    disclosures = [...disclosures, { kind, text }];
  }
  // §089 — a HEAD-reading command never claims `+dirty`, but a dirty tree still means this answer may not match
  // what's on disk today; text already says so via DIRTY_TREE_NOTE below, JSON never carried it at all until now.
  if (treeDirty) disclosures = [...disclosures, { kind: 'dirty-tree', text: DIRTY_TREE_NOTE }];
  if (opts.json) {
    const { hits } = whereCmd({
      model,
      query: args.join(' '),
      top: +opts.top || 3,
      mapRows: +opts['map-rows'] || 60,
      exemplarOk: existsMemo(root),
    });
    return [
      JSON.stringify({
        query: args.join(' '),
        hits: hits.map(h => ({
          type: h.type,
          label: h.label,
          partition: h.part,
          score: +h.score.toFixed(3),
          size: h.n,
          directories: h.topDirs.map(([d, n]) => ({ dir: d, n })),
          // a `file` card's own keys already bake in the real line as their 4th segment (`rel#kind#name#line`, built
          // in core.mjs's card-building pass) — unlike every other card type, whose keys are `skeyR` identity keys
          // (`rel#kind#name[#ord]`) where a 4th segment, when present, is a dedup ordinal, never a line. Matches the
          // text-rendering path's own split: `h.type === 'file'` naively destructures the key (core.mjs's `matching`),
          // every other type resolves through `scopeLine` (core.mjs's `withLine`).
          members: h.members
            ? h.members.slice(0, 12).map(k => {
                const [rel, kind, name, rawLine] = k.split('#');
                return {
                  rel,
                  kind,
                  name,
                  line: h.type === 'file' ? (rawLine ? +rawLine : null) : scopeLine(part(model, h.part), k),
                };
              })
            : undefined,
          conventions: h.facts.slice(0, 6).map(f => ({
            id: h.part + '::' + f.cid + '::' + f.pid,
            statement: verbalize(
              f,
              f.exemplars.map(e => e.name)
            ),
            share: f.share,
            established: f.sraw,
            exemplars: f.exemplars,
            deviants: f.deviants || [],
            trend: f.trend ? f.trend.shares.map(x => x.share) : null,
            held: f.held || null,
          })),
        })),
        signal: sig,
        disclosures, // §089 — additive: the same { kind, text } lines the text renderer above already emitted
        asOf: stamp().replace(/^as of /, ''),
      }),
    ];
  }
  return [...lines, ...(treeDirty ? [DIRTY_TREE_NOTE] : []), stamp()];
}
// `how <intent>` — the same intent `where` answers structurally, answered by example instead: which past commits
// look like the change being asked about, and which files such a change actually touched.
// History is loaded HERE, inside the command, and not read off `ctx`: `ensureFresh`'s fast path (a fresh cache)
// never calls `loadHistory` at all, so no ctx ever carries `H`; adding it there would force every `where` and
// `check` to parse the (fps-sized) history.json for a field they never read. `cmdExport` loads its own history for
// exactly the same reason.
export async function cmdHow({ model, root, isGit, args, opts, stamp, store, treeDirty }) {
  if (!args.length) throw new Error('usage: grain how <intent words>');
  const query = args.join(' ');
  let H = null;
  if (isGit && !opts['no-history']) {
    try {
      H = (await loadHistory({ gitdir: root, store, log })).H;
    } catch (e) {
      log('history unavailable for how: ' + e.message);
    }
  }
  if (!H || !H.fps || !H.fps.length) {
    // no git, --no-history, a shallow clone, or an unreadable history: say so and stop, never crash
    const why = !isGit
      ? 'this is not a git repository'
      : opts['no-history']
        ? '--no-history was passed'
        : 'this repository has no readable commit history';
    const note = `no history available for match-by-example (${why}) — see \`grain where ${query}\` instead, which answers the same intent from the model's structure rather than from past commits.`;
    if (opts.json)
      return [
        JSON.stringify({
          query,
          matches: [],
          places: [],
          missing: [],
          shape: null,
          note,
          asOf: stamp().replace(/^as of /, ''),
        }),
      ];
    return [note, ...(treeDirty ? [DIRTY_TREE_NOTE] : []), stamp()];
  }
  // the commit SUBJECT is not in `fps` (J2.1 keeps only its ≤12 normalized tokens), so it is read back from git for
  // the handful of shas that actually matched — never for all of `fps`
  const msgCache = new Map();
  const msgOf = sha => {
    if (msgCache.has(sha)) return msgCache.get(sha);
    let m = null;
    try {
      m = execFileSync('git', ['-C', root, 'show', '-s', '--format=%s', sha], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      /* a sha git can no longer resolve: fall back to the indexed tokens */
    }
    msgCache.set(sha, m);
    return m;
  };
  const { lines, matches, places, missing, shape } = howCmd({
    model,
    H,
    query,
    top: +opts.top || 5,
    msgOf,
    mapRows: +opts['map-rows'] || 60,
    exemplarOk: existsMemo(root),
  });
  if (opts.json)
    return [
      JSON.stringify({
        query,
        matches: matches.map(m => ({ sha: m.sha, ts: m.ts, msg: m.msg, files: m.files, score: m.score })),
        places,
        missing,
        shape,
        asOf: stamp().replace(/^as of /, ''),
      }),
    ];
  return [...lines, ...(treeDirty ? [DIRTY_TREE_NOTE] : []), stamp()];
}
// `what <words>` (§J3.3) — the model's own concept card for a word or phrase: declarations, indexed values, their
// spread across modules, sibling values, historical commit mentions and file-level fan-in. Unlike `how`, most of
// this needs no history at all (declarations/values/spread/siblings/fan-in are plain model reads) — only the
// commit-count source does, so this loads H the same lazy way `how` does but never early-returns on its absence;
// `whatCmd` itself simply omits the `changes:` line when `H` is null or has no readable footprints.
// (§018/§014 shape) a BOUNDED raw-text re-scan, only over files `blindFiles` already names as parsed-but-zero-
// scope (never the whole repository, never a re-parse): does the query's exact text appear, verbatim, in one of
// them? A plain substring match, deliberately — this is a hedge ("grain cannot see inside a file that might hold
// this"), never a certified claim, so it does not need declaration-level precision the way `defined:` does.
// Called only when the plain answer would otherwise be the bare "nothing" claim (see cmdWhat below): an
// unconditional, repo-wide version of this hedge was tried first and measured wrong — see blindFiles' own note.
// `strict` (§037) is the same scan held to a higher bar, because it interrupts an answer the reader is already
// reading rather than explaining an empty one: the blind files are narrowed to the peer-ANOMALOUS ones (see
// `blindFiles`), and the text must match at identifier boundaries with exact case — not as a substring, which
// would let «json» hit `jsonify` and every URL in a comment. Measured on nine real repos: substring alone fires
// the caveat on 18.6% of non-empty answers, word-boundary on 14.4%, and the two conditions together with
// `weakName`'s own ≥2-token cut on 1.7%.
export function findBlindHit(model, root, query, strict = false) {
  if (!strict) {
    // §018's original path, byte-for-byte: first blind file whose raw text contains the query
    for (const rel of blindFiles(model)) {
      let text;
      try {
        text = readFileSync(join(root, rel), 'utf8');
      } catch {
        continue;
      }
      if (text.includes(query)) return rel;
    }
    return null;
  }
  const re = new RegExp(
    '(^|[^A-Za-z0-9_$])' + query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^A-Za-z0-9_$]|$)',
    'g'
  );
  // Several blind files can carry the name — a declaration site and the barrel that re-exports it. Naming the one
  // with the most occurrences puts the reader at the declaration rather than at a one-line `pub use`; it is a
  // tie-break among files that ALREADY passed the gate, so it changes which file is named, never whether the
  // caveat fires. (Measured on axum: `what JsonDataError` names `extract/rejection.rs`, where the macro actually
  // emits the type, instead of the alphabetically-earlier `axum-extra/src/extract/mod.rs` that only re-exports it.)
  let best = null;
  for (const rel of blindFiles(model, { peerAnomalous: true })) {
    let text;
    try {
      text = readFileSync(join(root, rel), 'utf8');
    } catch {
      continue;
    }
    const n = (text.match(re) || []).length;
    if (n && (!best || n > best.n)) best = { rel, n };
  }
  return best ? best.rel : null;
}
// (§057) `ungrammaredFiles` (core.mjs) names tracked paths grain never even ATTEMPTED to parse — no grammar
// registered for the extension at all, a strictly stronger and cheaper fact than `blindFiles`' "parsed but
// yielded zero scopes" (which still needed §037's peer-anomaly gate to mean anything). A plain, unbounded
// substring match is enough here: no heuristic, no gate, because "this format was never read" is true or false,
// never a matter of degree. Bounded to the ungrammared set only (never a repo-wide grep), and returns the FIRST
// match — with no scope-level evidence to rank by, unlike `findBlindHit`'s occurrence-count tie-break, the first
// hit is exactly as informative as any other.
export function findUngrammaredHit(model, root, query) {
  for (const rel of ungrammaredFiles(model)) {
    let text;
    try {
      text = readFileSync(join(root, rel), 'utf8');
    } catch {
      continue;
    }
    if (text.includes(query)) return { file: rel, ext: extname(rel) || '(no extension)' };
  }
  return null;
}
