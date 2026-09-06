// grain CLI — the query surface over the engine, with the index store, auto-refresh and freshness stamps.
//
//   grain where <intent words>      intent → where such things live, what is expected there, exemplars, co-change
//   grain check <file>              how this file (its WORKTREE version) sits against the local norm field
//   grain review                    one aggregated report over every file in your whole uncommitted change
//   grain spectrum <file>           the full local→global convention lattice for one file, no acceptance cut
//   grain status | grain report     model overview, freshness, trends, health
//   grain refresh [--full]          rebuild the index now (auto-refresh already runs before every query)
//
// Every answer ends with `as of <sha>`. `+dirty` means "this answer incorporates your uncommitted edits" (§013/§024
// ruling) — only `check`/`review` (always) and `spectrum`/`explain` (for the one file asked about) ever earn it.
// Every other command answers from the indexed commit alone and never claims `+dirty`; when the worktree is dirty
// it gets a separate, plain disclosure instead (§024c) — never that marker, which would be a false claim for them.
// The index lives in <repo>/.grain/cache/ (gitignored, disposable). Uncommitted changes never feed the norm — only
// `check`/`review`/`spectrum` read the worktree version of the file(s) asked about.
//
// The split of this file (ticket 124) is in progress: the seams already cut live in the sibling
// modules re-exported at the bottom, and every name this file exported before the split is still
// exported here.
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { join, resolve, isAbsolute, extname, sep } from 'node:path';
import { execFileSync } from 'node:child_process';
import { ENGINE_VERSION, EXTR_V, HIST_V, MODEL_V, GRAMMARS, EXT2GRAMMAR, HARD_EXCL } from './config.mjs';
import {
  checkFile,
  spectrum,
  howCmd,
  howEval,
  whereEval,
  obligationFor,
  obligationEval,
  statusLines,
  completenessDirectional,
  cochangeData,
  scopeCochangeLines,
  missingLines,
  valueKinGaps,
  mutateTest,
  extractCoverage,
  walkFiles,
  verbalize,
  toPosix,
  scopeLabel,
  groupDeviations,
  placementHit,
  fileLevelPreds,
  pct,
  part,
  voice,
  inLineForFile,
  archCellLabel,
  ptr,
  skipLineNote,
} from './core.mjs';
import { loadHistory, headSha, headTree, readHistoryState } from './history.mjs';
import { exportModel } from './export.mjs';
import { createHash } from 'node:crypto';
import {
  hydrateScope,
  applyVocab,
  partitionFor,
  verbalize as verb2,
  baselineShare,
  DIRTY_TREE_NOTE,
  heritageKindOf,
} from './core.mjs';
import {
  atomicWrite,
  canonicalize,
  changedRanges,
  ensureFresh,
  existsMemo,
  fileDirty,
  findRoot,
  loadScopes,
  log,
  parseArgv,
  readJson,
  readSeeds,
  relPath,
  repoDirty,
  short,
  storeFor,
} from './grain-context.mjs';
import { cmdReport, cmdRules, cmdStatus, freshnessLines } from './grain-report.mjs';
import {
  capReviewLines,
  hookCwd,
  recordCheckFeedback,
  recordPlacementPending,
  resolvePlacementPending,
  seenGate,
  sessionContext,
} from './grain-session.mjs';
import { cmdMap, cmdObligation, cmdWhat } from './grain-what.mjs';
import { cmdHow, cmdWhere } from './grain-where.mjs';

// per-scope conformance tally from a checkFile() result — shared by `check` (its own "conforms to:" line) and
// `review`'s --json (the same `governed` shape, per file). `touched` (optional, cmdCheck's own line-range test)
// additionally tallies `inChange`: how many of THIS fact's governing scopes fall inside the reader's own edit — the
// count `check`'s "conforms to:" line filters on (§003-A1: a fact governing only untouched scopes must not read as
// the CHANGE conforming to it). Omitted (review's callers, and check on a path with no diff to scope against),
// every governed scope counts as "in change" — the original, unscoped behavior.
function govFactsOf(r, touched) {
  const m = new Map();
  for (const g of r.governed) {
    const k = g.fact.cid + '|' + g.pid;
    const e = m.get(k) || { g, n: 0, ok: 0, inChange: 0 };
    e.n++;
    if (g.conforms) e.ok++;
    if (!touched || touched(g.line, g.endLine || g.line)) e.inChange++;
    m.set(k, e);
  }
  return m;
}
// the core "turn one checkFile() result into THIS file's own finding lines" step — shared by `check` (one file, full
// detail: this feeds its in-change/pre-existing split, everything else in cmdCheck is check-only presentation) and
// `review` (many files: only these four categories count as a finding — placement, maintainer decisions departed
// from, architecture hits, and deviations inside the lines this file itself changed; pre-existing deviations outside
// the change are deliberately excluded here too, same "not yours to fix" discipline as single-file `check`)
async function fileFindings({ root, rel, isGit, dirty, r, wholeFile = false, diffArgs }) {
  const ranges = wholeFile ? [[1, Infinity]] : dirty ? changedRanges(root, rel, isGit, diffArgs) : [];
  const touched = ranges === null ? null : (from, to) => ranges.some(([a, b]) => to >= a && from - 3 <= b); // a scope is "in your change" when any changed line falls inside it or in the three lines above it (its decorator stack)
  // a file-kind fact (quote style, filename shape, export style…) describes the WHOLE file's content, not a bounded
  // line range — its pseudo-scope sits at line 1 (extractScopes, core.mjs), so the line-range `touched` above would
  // misattribute it by whether the diff happens to touch line 1, not by whether THIS edit changed the fact's value
  // (G10). Classify it instead by comparing against the predicate recomputed on the file's content at the correct
  // "before" ref — one extra parse, only when a file-kind deviation actually exists and the file is dirty.
  let fkTouched = null;
  if (!wholeFile && dirty && r.msgs.some(m => m.kind === 'file')) {
    const beforeRef = diffArgs && diffArgs.length === 2 ? diffArgs[0] : 'HEAD'; // --range a..b compares against a; default/--worktree/--staged all compare against HEAD (--cached's own baseline)
    const headSrc = refContent(root, beforeRef, rel);
    if (headSrc == null)
      fkTouched = () => true; // untracked, or didn't exist at beforeRef — every file-kind deviation is "in your change" by construction
    else {
      const headPreds = await fileLevelPreds(rel, headSrc);
      fkTouched = m => headPreds[m.pid] !== m.obs;
    }
  }
  const grouped = groupDeviations(r.msgs, touched, fkTouched);
  const inChange = grouped.filter(g => g.touched),
    preOnly = grouped.filter(g => !g.touched);
  const steerIn = (r.steerHits || []).filter(h => !touched || touched(h.line, h.endLine)),
    steerPre = (r.steerHits || []).filter(h => touched && !touched(h.line, h.endLine));
  const waiveIn = (r.waiverHits || []).filter(h => !touched || touched(h.line, h.endLine)),
    waivePre = (r.waiverHits || []).filter(h => touched && !touched(h.line, h.endLine));
  const archIn = (r.archHits || []).filter(h => !touched || touched(h.line, h.line)),
    archPre = (r.archHits || []).filter(h => touched && !touched(h.line, h.line));
  const lines = [
    ...steerIn.map(h => h.text),
    ...waiveIn.map(h => h.text),
    ...(r.placeHit ? [r.placeHit.text] : []),
    ...archIn.map(h => h.text),
    ...inChange.map(g => g.text + `\n  (preference gap ${g.delta} bits)`),
  ];
  return {
    touched,
    grouped,
    inChange,
    preOnly,
    steerIn,
    steerPre,
    waiveIn,
    waivePre,
    archIn,
    archPre,
    lines,
  };
}
// the machine-readable per-file verdict — the exact shape `check --json` has always returned, reused as-is for one
// file inside `review --json` so the two never drift into two schemas for the same facts
function fileVerdictJson({ rel, r, dirty, f, govFacts, stamp }) {
  const scopesN = r.scopes.filter(s => s.kind !== 'file').length;
  const { touched, inChange, preOnly } = f;
  const dev = g => ({
    convention: r.partition + '::' + g.factKey.split('|')[0] + '::' + g.pid,
    label: g.label,
    pid: g.pid,
    expected: g.exp,
    observed: g.obs,
    gapBits: g.delta,
    statement: g.text.split('\n')[0].replace(/^\[grain\] /, ''),
    hits: g.hits.map(h => ({ scope: h.scope, kind: h.kind, line: h.line, inChange: h.touched })),
  });
  return {
    schema: 'grain-check/1',
    file: rel,
    partition: r.partition,
    label: r.partition ? scopeLabel(r.partition) : null,
    scopes: scopesN,
    dirty,
    hasError: !!r.hasError,
    governed: [...govFacts.values()].map(e => ({
      convention: r.partition + '::' + e.g.fact.cid + '::' + e.g.pid,
      label: e.g.label,
      statement: verbalize(
        e.g.fact,
        e.g.fact.exemplars.map(x => x.name)
      ),
      established: e.g.fact.sraw,
      share: e.g.fact.share,
      scopes: e.n,
      conforming: e.ok,
      // §042 — present only for a per-file lexical vote that hid departing instances: `conforming`/`scopes` above
      // count SCOPES (a file is one), and for a style surface the file's verdict is a majority over its instances.
      // Absent means nothing was hidden, never that the surface was not checked. `flagged`/`flagLines` (§077) are
      // present only when the quote surface's hidden instances include genuine, non-delimiter-forced violations —
      // the same per-literal flag the printed `conforms to:` line's clause now carries (lexTally's `note`).
      ...(e.g.tally
        ? {
            withinFile: {
              conforming: e.g.tally.conforming,
              total: e.g.tally.total,
              surface: e.g.pid,
              ...(e.g.tally.flagged ? { flagged: e.g.tally.flagged, flagLines: e.g.tally.flagLines } : {}),
            },
          }
        : {}),
      defining: !!e.g.defining,
    })),
    deviationsInChange: inChange.map(dev),
    deviationsPreExisting: preOnly.map(dev),
    steers: (r.steerHits || []).map(h => ({
      seed: h.id,
      pid: h.pid,
      expected: h.exp,
      observed: h.obs,
      scope: h.scope,
      kind: h.kind,
      line: h.line,
      inChange: !touched || touched(h.line, h.endLine),
    })),
    waivers: (r.waiverHits || []).map(h => ({
      waiver: h.id,
      pid: h.pid,
      expected: h.exp,
      observed: h.obs,
      scope: h.scope,
      kind: h.kind,
      line: h.line,
      inChange: !touched || touched(h.line, h.endLine),
    })),
    architecture: (r.archHits || []).map(h => ({
      kind: h.kind,
      to: h.to,
      line: h.line,
      seed: h.id || null,
      inChange: !touched || touched(h.line, h.line),
    })),
    placement: r.placeHit
      ? {
          token: r.placeHit.token,
          dir: r.placeHit.dir,
          statement: r.placeHit.text.replace(/^\[grain\] /, ''),
        }
      : null,
    // §089 — the exact caveat `check`'s own text renderer prints under the headline for this same `r.hasError`
    // flag (already present above as a plain boolean); review's text prints the identical sentence per file, or
    // (over its display cap) an aggregate line naming the count instead — either way the underlying fact is the
    // same, so it is always disclosed here structurally, one place, matching `check`'s own wording verbatim.
    disclosures: r.hasError
      ? [
          {
            kind: 'parse-degraded',
            text: '(parse degraded — part of this file sits in error nodes; the scope list above may be incomplete)',
          },
        ]
      : [],
    asOf: stamp(dirty).replace(/^as of /, ''),
  };
}
export async function cmdCheck({ model, root, isGit, args, opts, stamp, store }) {
  if (!args[0]) throw new Error('usage: grain check <file> [--as <repo-relative path>]');
  const rel = relPath(root, args[0]);
  const refs = reviewRefs(opts); // --range/--staged: read the file as of a ref instead of the worktree, exactly like cmdReview
  const fromFlag = opts.content ? readFileSync(opts.content, 'utf8') : undefined; // --content stays the highest-precedence override, unrelated to refs
  const content =
    fromFlag !== undefined ? fromFlag : refs ? refContent(root, refs.contentRef, rel) : undefined;
  if (fromFlag === undefined) {
    if (refs) {
      if (content == null)
        throw new Error(`no such file: ${rel} (not present at ${refs.contentRef || 'that ref'})`);
    } else if (!existsSync(join(root, rel))) throw new Error(`no such file: ${rel}`);
  }
  if (!EXT2GRAMMAR[extname(rel)]) {
    const ph = placementHit(model, rel);
    const dirty0 = fileDirty(root, rel, isGit, refs?.diffArgs);
    // §089 — the same sentence the text branch below prints, kept in one place so JSON and text can never drift
    const noGrammarText = `check ${rel}: no grammar for "${extname(rel) || 'a file without extension'}" — grain parses ${GRAMMARS.join(', ')}`;
    if (opts.json)
      return [
        JSON.stringify({
          schema: 'grain-check/1',
          file: rel,
          noGrammar: extname(rel) || null,
          dirty: dirty0,
          placement: ph
            ? { token: ph.token, dir: ph.dir, statement: ph.text.replace(/^\[grain\] /, '') }
            : null,
          disclosures: [{ kind: 'no-grammar', text: noGrammarText }],
          asOf: stamp(dirty0).replace(/^as of /, ''),
        }),
      ];
    return [noGrammarText, ...(ph ? [ph.text] : []), stamp(dirty0)];
  }
  const r = await checkFile({ model, root, rel, content, asPath: opts.as, exemplarOk: existsMemo(root) });
  const dirty = fromFlag !== undefined ? true : fileDirty(root, rel, isGit, refs?.diffArgs);
  const lines = [];
  if (!r.partition) {
    const arch = (r.archHits || []).map(h => h.text);
    // §089 — same sentence as the text branch below, one place so JSON and text can never drift
    const noPartitionText = `check ${rel}: ${r.reason} — grain has no norm to hold this file against`;
    if (opts.json)
      return [
        JSON.stringify({
          schema: 'grain-check/1',
          file: rel,
          noPartition: true,
          reason: r.reason,
          placement: r.placeHit
            ? {
                token: r.placeHit.token,
                dir: r.placeHit.dir,
                statement: r.placeHit.text.replace(/^\[grain\] /, ''),
              }
            : null,
          architecture: (r.archHits || []).map(h => ({
            kind: h.kind,
            to: h.to,
            line: h.line,
            seed: h.id || null,
          })),
          disclosures: [{ kind: 'no-partition', text: noPartitionText }],
          asOf: stamp(dirty).replace(/^as of /, ''),
        }),
      ];
    return [
      noPartitionText,
      ...(r.placeHit ? [r.placeHit.text] : []),
      ...arch,
      stamp(dirty),
    ];
  }
  const scopesN = r.scopes.filter(s => s.kind !== 'file').length;
  if (r.hasError && scopesN === 0) {
    // a real parse failure, not a genuinely trivial file — the ONLY case this branch may fire for now (it used to be permanently dead: r.scopes.length is never 0 because extractScopes always pushes a file-kind pseudo-scope)
    // §089 — same sentence as the text branch below, one place so JSON and text can never drift
    const parseFailedText = `check ${rel}: parse failed — this file is largely unparseable (unsupported syntax or a grammar limitation); its scope list is empty and may be missing real content`;
    if (opts.json)
      return [
        JSON.stringify({
          schema: 'grain-check/1',
          file: rel,
          parseFailed: true,
          hasError: true,
          disclosures: [{ kind: 'parse-failed', text: parseFailedText }],
          asOf: stamp(dirty).replace(/^as of /, ''),
        }),
      ];
    return [parseFailedText, stamp(dirty)];
  }
  const { touched, inChange, preOnly, steerIn, steerPre, waiveIn, waivePre, archIn, archPre } =
    await fileFindings({
      root,
      rel,
      isGit,
      dirty,
      r,
      wholeFile: fromFlag !== undefined,
      diffArgs: refs?.diffArgs,
    });
  // §003-A1: "conforms to:" is scoped to the reader's own change (below) whenever we actually KNOW what changed —
  // `dirty` false (nothing differs from HEAD) or `touched` null (no git / diff unavailable) both mean there is no
  // real change-range to scope against, so govFactsOf's unscoped default (every governed scope counts) is kept,
  // exactly as before this fix.
  const govFacts = govFactsOf(r, dirty ? touched : null);
  if (store)
    recordCheckFeedback(store, rel, r.partition, inChange, content ?? readFileSync(join(root, rel), 'utf8'));
  if (opts.json)
    return [
      JSON.stringify(fileVerdictJson({ rel, r, dirty, f: { touched, inChange, preOnly }, govFacts, stamp })),
    ]; // machine-readable verdict: the same facts `check` prints, as data (consumers: harnesses, training pipelines)
  const inl = inLineForFile(model, opts.as || rel);
  if (inl) lines.push(inl);
  // §010(c): computed here, ahead of the headline, so a pending new-scope disclosure can qualify the headline's own
  // "0 deviation(s)" IN PLACE rather than being disclosed only in lines a reader may never reach below it — a dev
  // skimming just the headline must not read an unqualified clean bill of health while grain is disclosing it
  // cannot judge part of the change. `newCount` is the raw SCOPE count (checkFile's `count` field), not the
  // collapsed line count, matching what a reader actually needs qualified ("N unclassified scopes", not "N lines").
  const newIn = (r.newScopeHits || []).filter(h => !touched || touched(h.line, h.endLine));
  const newPre = (r.newScopeHits || []).filter(h => touched && !touched(h.line, h.endLine));
  const newCount = newIn.reduce((a, h) => a + (h.count || 1), 0);
  // byte-identical to the pre-§010 wording whenever nothing is pending (newCount === 0) — only a real disclosure
  // changes the headline's shape, never its absence
  lines.push(
    `check ${rel} — ${scopeLabel(r.partition)} · ${scopesN} scopes + file · governed by ${govFacts.size} convention(s) · ${inChange.length} ${newCount ? 'known deviation(s)' : 'deviation(s)'} in your change, ${preOnly.length} pre-existing${newCount ? `, ${newCount} unclassified scope(s)` : ''}${steerIn.length ? ` · ${steerIn.length} maintainer decision(s) your change departs from` : ''}`
  );
  if (r.hasError)
    lines.push(
      `  (parse degraded — part of this file sits in error nodes; the scope list above may be incomplete)`
    );
  if (steerPre.length && !steerIn.length)
    lines.push(
      `  (${steerPre.length} existing ${steerPre.length > 1 ? 'scopes are' : 'scope is'} still on a pattern a maintainer decision retires — a transition in progress, not yours to fix; \`--all\` lists)`
    );
  for (const h of steerIn) lines.push(h.text);
  for (const h of waiveIn) lines.push(h.text);
  if (waivePre.length)
    lines.push(
      `  (${waivePre.length} waived departure(s) on lines you did not touch — \`--all\` shows${opts.all ? ':' : ''})`
    );
  if (waivePre.length && opts.all) for (const h of waivePre) lines.push(h.text);
  if (r.placeHit) lines.push(r.placeHit.text);
  for (const h of archIn) lines.push(h.text);
  if (archPre.length)
    lines.push(
      `  (${archPre.length} architecture note(s) on lines you did not touch — \`--all\` shows${opts.all ? ':' : ''})`
    );
  if (archPre.length && opts.all) for (const h of archPre) lines.push(h.text);
  if (steerPre.length && steerIn.length)
    lines.push(
      `  (${steerPre.length} more existing ${steerPre.length > 1 ? 'scopes' : 'scope'} still on the retired pattern — a transition in progress, not yours to fix)`
    );
  if (steerPre.length && opts.all) for (const h of steerPre) lines.push(h.text);
  // §003-B: scopes checkFile found genuinely new to the index — already collapsed one line per (kind, neighbour)
  // by checkFile itself (§010-a); capped and scoped to the change the same way steer/waiver/architecture hits
  // above are, mirroring check-hook's own speak.slice(0, 8) + "+N more" idiom. `newIn`/`newCount` were computed
  // above, ahead of the headline.
  for (const h of newIn.slice(0, 8)) lines.push(h.text);
  if (newIn.length > 8)
    lines.push(
      `  (+${newIn.length - 8} more new-to-the-index group(s) in your change — \`grain check ${rel} --all\` for the rest)`
    );
  if (newPre.length) {
    const newPreCount = newPre.reduce((a, h) => a + (h.count || 1), 0);
    lines.push(
      `  (${newPreCount} more scope(s) elsewhere in this file were never indexed either — not in your change, \`--all\` shows${opts.all ? ':' : ''})`
    );
  }
  if (newPre.length && opts.all) for (const h of newPre) lines.push(h.text);
  // superficial: a file-level fact by definition, or a naming-shape/lexical surface — governs no behavior even when it
  // sits on a type/method-kind scope (a class named PascalCase is not a "shape of code" certification any more than a
  // file's import style is)
  const SUPERFICIAL_PID = /^auto\.(nameshape|filenameshape|namesuffix)$|^auto\.lex:/;
  if (!govFacts.size)
    lines.push(
      '  no strong convention governs this file — grain has nothing certified for this kind of file here; that is not approval, open the nearest neighbour and copy it'
    );
  else if ([...govFacts.values()].every(e => e.g.fact.kind === 'file' || SUPERFICIAL_PID.test(e.g.fact.pid)))
    lines.push(
      "  only naming and lexical style is certified here (quotes, declarations, imports, name shape) — nothing about the shape of this file's code; that is not approval, open the nearest neighbour and copy it"
    );
  for (const g of inChange) lines.push(g.text + `\n  (preference gap ${g.delta} bits)`);
  if (preOnly.length) {
    if (opts.all) for (const g of preOnly) lines.push(g.text + `\n  (preference gap ${g.delta} bits)`);
    // `g.summary` is carried only by §J5.8's structural-shape deviations: they have no predicate, so `verbalize`
    // has no row for them and would print the raw `auto.shape:<sig> = <count>` pid here
    else
      lines.push(
        `pre-existing (not in your change, not yours to fix — \`--all\` to list): ${preOnly
          .slice(0, 4)
          .map(
            g =>
              `${g.label}: ${g.summary || verbalize({ ...g, kind: g.kind }, g.exNames || []).replace(/ here /, ' ')} ×${g.pre}`
          )
          .join(' · ')}${preOnly.length > 4 ? ` · +${preOnly.length - 4} more` : ''}`
      );
  }
  // §003-A1: `e.inChange` is 0 for a fact whose only governed scopes sit outside the reader's own change (see
  // govFactsOf above) — such a fact must not read as "the change conforms to it". `e.inChange` defaults to `e.n`
  // (always > 0) whenever govFacts was built unscoped, so this adds no new gate on that path.
  const ok = [...govFacts.values()].filter(
    e =>
      e.ok === e.n &&
      e.inChange > 0 &&
      !(e.g.fact.exp === 'false' && /^auto\.(has|call|deco|extends|imp|stshape|returns):/.test(e.g.pid))
  );
  const supNote = e =>
    e.g.fact.contested ? ` — superseded by maintainer decision ${e.g.fact.contested}` : '';
  // §003-A2: a marker-tautology fact (its pid IS the feature that formed the group — see isDefiningFact) is not
  // suppressed here, but it is not left to read as an ordinary followed convention either: the clause says what it
  // actually is — the group's own definition, enforceable on members and, by construction, on no one else.
  const defNote = e =>
    e.g.defining ? ` — defines this group; grain enforces it on members, not on a non-member` : '';
  // §042: a style surface's verdict is a per-file majority, so "conforms" can be true while instances in this very
  // file depart. Say so on the line that claims conformance, never only in --json.
  const tallyNote = e => (e.g.tally ? e.g.tally.note : '');
  if (ok.length)
    lines.push(
      `conforms to: ${ok
        .slice(0, 6)
        .map(
          e =>
            `${e.g.label}: ${verbalize(
              e.g.fact,
              e.g.fact.exemplars.map(x => x.name)
            )} (${pct(e.g.fact.share)}% of ${e.g.fact.sraw})${supNote(e)}${defNote(e)}${tallyNote(e)}`
        )
        .join(' · ')}${ok.length > 6 ? ` · +${ok.length - 6} more` : ''}`
    );
  // §042 — the same disclosure, for a governed lexical fact that never reached the line above: `ok` requires
  // `inChange > 0`, and a file-kind fact's pseudo-scope sits at line 1, so an edit deeper in the file scopes it out
  // (G10's line-range mismatch, here on the conforming side) — exactly the reported case, where 7 added single-quoted
  // literals produced no output at all. What the vote could not see must not depend on where in the file you typed.
  const shownOk = new Set(ok.slice(0, 6));
  for (const e of govFacts.values())
    if (e.g.tally && !shownOk.has(e))
      lines.push(
        `  (${e.g.label}: ${verbalize(
          e.g.fact,
          e.g.fact.exemplars.map(x => x.name)
        )}${e.g.tally.note})`
      );
  const knownFiles = new Set(model.partitions.flatMap(p => p.files));
  const files = [rel];
  const newFileScopes = knownFiles.has(rel) ? {} : { [rel]: r.scopes };
  // cochange only, deliberately no 'recipe': recipeLines' "is the companion present in the changed set" test on a
  // one-file changed set ([rel]) would spuriously fire on almost every new file — recipe stays exclusive to
  // `review`'s many-file changed set, where that test is meaningful
  lines.push(...missingLines(model, files, { sources: ['cochange'], newFileScopes }));
  lines.push(...scopeCochangeLines(model, rel, r.partition));
  // §073: the birth-obligation table's own structural silence — a file `--as` simulates at a path that does not
  // exist yet has no co-change history (the block above), but its (module, suffix) CLASS may still certify a
  // specific companion. One line, top rule only (`obligationLines`' full two-set report is `grain obligation`'s
  // own job); silent when nothing certifies, the same restraint `scopeCochangeLines` already shows here.
  const oblig = obligationFor(model, opts.as || rel);
  if (oblig.rules.length) {
    const top = oblig.rules[0];
    const kindWord = oblig.suffix ? `*.${oblig.suffix}` : '(no extension)';
    const dirWord = oblig.module === '.' ? 'the repo root' : oblig.module + '/';
    lines.push(
      voice(
        'practiced',
        `obligation: a new ${kindWord} under ${dirWord} has come with ${top.file} (${top.k} of ${top.n})`
      )
    );
  }
  lines.push(stamp(dirty));
  return lines;
}
// plain git plumbing, no new wrapper (mirrors changedRanges/fileDirty above): `git diff --name-only <ref-args>` for
// --staged and --range; default/--worktree unions the worktree-vs-HEAD diff (covers staged AND unstaged, since a
// plain `diff HEAD` already compares the full working tree to HEAD regardless of the index) with untracked new
// files, because an agent mid-task has usually not staged anything yet. A bad --range is not our error to shape —
// stderr is captured and re-thrown verbatim so git's own message reaches the user.
function gitNameOnly(root, args) {
  let out;
  try {
    out = execFileSync('git', ['-C', root, ...args, '-z'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    throw new Error((e.stderr || e.message || '').toString().trim() || `git ${args.join(' ')} failed`);
  }
  return out.split('\0').filter(Boolean);
}
function reviewFileList(root, opts) {
  const raw = opts.range
    ? gitNameOnly(root, ['diff', '--name-only', opts.range])
    : opts.staged
      ? gitNameOnly(root, ['diff', '--cached', '--name-only'])
      : [
          ...gitNameOnly(root, ['diff', '--name-only', 'HEAD']),
          ...gitNameOnly(root, ['ls-files', '--others', '--exclude-standard']),
        ];
  return [...new Set(raw.map(toPosix))].filter(p => !HARD_EXCL.test(p)).sort();
} // sorted for a deterministic, reviewable report — git's own diff order is an artifact of its tree walk, not signal
// which git refs define "the change" for this review mode, and where to read a file's content from — null means
// the existing worktree-vs-HEAD behavior (default/--worktree), unchanged
function reviewRefs(opts) {
  if (opts.range) {
    const m = /^(.+?)\.{2,3}(.+)$/.exec(opts.range);
    if (!m) throw new Error(`--range must be <a>..<b>, got "${opts.range}"`);
    return { diffArgs: [m[1], m[2]], contentRef: m[2] };
  } // review the file AS OF the range's end commit, so line numbers in the diff match the content being parsed
  if (opts.staged) return { diffArgs: ['--cached'], contentRef: '' }; // '' + ':' + rel => git's `:rel` syntax for the index/staged blob
  return null;
}
function refContent(root, ref, rel) {
  try {
    return execFileSync('git', ['-C', root, 'show', `${ref}:${rel}`], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    return null;
  }
} // deleted at that ref / not tracked there — nothing to check
export async function cmdReview({ model, root, isGit, args, opts, stamp, store }) {
  if (args.length)
    throw new Error(
      'usage: grain review [--json] — no file argument; for one file, use `grain check <file>`'
    );
  if (!isGit)
    return [
      'review: not a git repository — there is no committed HEAD to measure "your change" against',
      stamp(),
    ];
  const files = reviewFileList(root, opts); // throws with git's own stderr on a bad --range
  const refs = reviewRefs(opts); // null | { diffArgs, contentRef } — see reviewRefs
  let anyDirty = false;
  const perFile = [];
  const newFileScopes = {};
  const changedScopes = {};
  const knownFiles = new Set(model.partitions.flatMap(p => p.files)); // committed-as-of-HEAD files only — anything else is "new" for the recipe source below
  for (const rel of files) {
    const dirty = fileDirty(root, rel, isGit, refs?.diffArgs);
    anyDirty = anyDirty || (!opts.range && dirty); // "+dirty" in the stamp means "used uncommitted content" — never true for an already-committed --range
    const content = refs ? refContent(root, refs.contentRef, rel) : undefined;
    if (refs ? content == null : !existsSync(join(root, rel))) continue; // deleted at the ref / deleted in worktree — nothing left to hold against a norm
    if (!EXT2GRAMMAR[extname(rel)]) {
      const ph = placementHit(model, rel); // no grammar: only a placement signal can still speak (mirrors `check`'s no-grammar case)
      if (ph)
        perFile.push({
          rel,
          dirty,
          r: null,
          f: { steerIn: [], waiveIn: [], archIn: [], inChange: [], preOnly: [], lines: [ph.text] },
        });
      continue;
    }
    let r;
    try {
      r = await checkFile({ model, root, rel, content, exemplarOk: existsMemo(root) });
    } catch (e) {
      perFile.push({
        rel,
        dirty,
        r: null,
        f: {
          steerIn: [],
          waiveIn: [],
          archIn: [],
          inChange: [],
          preOnly: [],
          lines: [`[grain] ${rel}: parse failed — skipped (${e.message})`],
        },
      });
      continue;
    }
    if (!knownFiles.has(rel)) newFileScopes[rel] = r.scopes; // captured whether or not the file has a finding below — a clean new file can still miss a recipe
    changedScopes[rel] = r.scopes; // EVERY parsed file of the change, new or not: §J3.2's value half asks about an enum that already exists, which newFileScopes deliberately never covers
    const f = await fileFindings({ root, rel, isGit, dirty, r, diffArgs: refs?.diffArgs });
    if (store)
      recordCheckFeedback(
        store,
        rel,
        r.partition,
        f.inChange,
        content ?? readFileSync(join(root, rel), 'utf8')
      );
    // §053: a degraded parse (r.hasError — part of the file sat in error nodes) must survive into review even
    // when the parseable remainder deviates from nothing, or the file vanishes from the aggregate exactly like a
    // clean one — the same absence `check` never allows (grain.mjs's check branch always prints the caveat).
    if (!f.lines.length && !r.hasError) continue; // no finding at all and nothing to disclose — contributes nothing, not even a placeholder
    perFile.push({ rel, dirty, r, f });
  }
  // presentation order, not a mathematically constrained gate: maintainer-decision/architecture hits first (the
  // highest-stakes findings), then plain deviations ranked by how many and how strong, placement-only files last
  const rank = e =>
    e.f.steerIn.length || e.f.archIn.length
      ? [0, -(e.f.steerIn.length + e.f.archIn.length), -e.f.inChange.length]
      : e.f.inChange.length
        ? [1, -e.f.inChange.length, -e.f.inChange.reduce((a, g) => a + g.delta, 0)]
        : [2, 0, 0];
  perFile.sort((a, b) => {
    const ra = rank(a),
      rb = rank(b);
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] - rb[i];
    return a.rel < b.rel ? -1 : 1;
  });
  const totalFindings = perFile.reduce((a, e) => a + e.f.lines.length, 0);
  // §053: which of THIS review's files carry the same parse-degraded caveat `check` prints for them individually
  // (r.hasError — part of the file sat in error nodes, so its scope list may be incomplete). Named here, once, so
  // both the text and JSON renderers below read one list rather than recomputing it two different ways.
  const degradedRels = perFile.filter(e => e.r && e.r.hasError).map(e => e.rel);
  // above this many, naming the caveat under every file drowns the actual findings in repeated boilerplate — one
  // summary line instead (same cap `cochangePartners`/health-row lists already use elsewhere in this file for the
  // identical reason: name a few, count the rest)
  const DEGRADED_CAVEAT_LIST_CAP = 5;
  const missing = missingLines(model, files, {
    sources: ['cochange', 'recipe', 'kin', 'shape'],
    newFileScopes,
    changedScopes,
  }); // one renderer for "what's still missing" — co-change (same data/threshold as `completeness <file>`), a missing companion/registration recipe for a genuinely new file, §J3.2's kin gaps, and §J4.2's change-shape gaps
  if (opts.json) {
    const ccPartners = cochangeData(model, files)
      .slice(0, 5)
      .map(h => `${h.file}${h.dead ? ' (deleted)' : ''} (co-changed in ${h.sup}/${h.commits} commits)`); // JSON contract unchanged (§023: same shape, now honest about a dead partner) — same values `completenessDirectional` used to produce
    return [
      JSON.stringify({
        schema: 'grain-check/1',
        files,
        findings: perFile.map(e =>
          e.r
            ? fileVerdictJson({
                rel: e.rel,
                r: e.r,
                dirty: e.dirty,
                f: e.f,
                govFacts: govFactsOf(e.r),
                stamp,
              })
            : {
                file: e.rel,
                noGrammar: extname(e.rel) || null,
                dirty: e.dirty,
                placement: { statement: e.f.lines[0].replace(/^\[grain\] /, '') },
              }
        ),
        cochangePartners: ccPartners,
        missing: {
          kin: files.flatMap(rel => {
            const fsc = (changedScopes[rel] || []).find(s => s.kind === 'file'); // the same raw data the `kin:` lines render, read straight from the engine — never scraped back out of the text
            return fsc
              ? valueKinGaps(model, rel, fsc.vals, new Set(files)).map(g => ({ file: rel, ...g }))
              : [];
          }),
        },
        asOf: stamp(anyDirty).replace(/^as of /, ''),
      }),
    ];
  }
  const lines = [
    `review ${files.length} file${files.length === 1 ? '' : 's'} · ${totalFindings} finding(s) across ${perFile.length} file(s)`,
  ];
  if (!totalFindings && !missing.length && !degradedRels.length)
    lines.push(
      `clean — nothing to report across ${files.length} file${files.length === 1 ? '' : 's'} reviewed`
    );
  // §053: over the cap, one summary line names the count instead of repeating the full sentence under every file
  // (below the cap, each degraded file still gets its own line inline, same wording `check` uses for the file alone)
  if (degradedRels.length > DEGRADED_CAVEAT_LIST_CAP)
    lines.push(
      `${degradedRels.length} of ${files.length} files reviewed have a degraded parse (part of each sits in error nodes) — their findings below may be incomplete`
    );
  for (const e of perFile) {
    lines.push(`== ${e.rel} — ${e.f.lines.length} finding(s) ==`);
    if (e.r && e.r.hasError && degradedRels.length <= DEGRADED_CAVEAT_LIST_CAP)
      lines.push(
        `  (parse degraded — part of this file sits in error nodes; the scope list above may be incomplete)`
      );
    for (const l of e.f.lines) lines.push(l);
  }
  lines.push(...missing);
  lines.push(stamp(anyDirty));
  return lines;
}
async function cmdSpectrum({ model, root, isGit, args, opts, stamp, store }) {
  if (!args[0]) throw new Error('usage: grain spectrum <file> [--minbits N] [--top N]');
  const rel = relPath(root, args[0]);
  const treeCache = readJson(store.treePath); // (sha|path) → { s: scopes, r: relation facts } of HEAD's files
  const scopesAll = treeCache
    ? Object.values(treeCache).flatMap(v => (Array.isArray(v) ? v : v.s))
    : readJson(store.scopesPath);
  const r = await spectrum({
    model,
    root,
    rel,
    minBits: opts.minbits !== undefined ? +opts.minbits : 0,
    top: +opts.top || 0,
    scopesAll,
  });
  return [...r.lines, stamp(fileDirty(root, rel, isGit))];
}
function appendDecision(store, rec) {
  appendFileSync(join(store.base, 'decisions.jsonl'), JSON.stringify(rec) + '\n');
}
function ensureSeedAttrs(store) {
  const p = join(store.base, '.gitattributes');
  if (existsSync(p)) return;
  writeFileSync(
    p,
    '# generated by grain: decisions from two branches merge line by line\nseeds.jsonl merge=union\ndecisions.jsonl merge=union\n'
  );
  log('created .grain/.gitattributes (merge=union for seeds.jsonl and decisions.jsonl)');
}
// the surfaces a scope carries right now, with values — what a maintainer picks from when recording a steer
async function scopeSurfaces({ model, store, rel, name, root, isGit, opts }) {
  const all = await loadScopes({ root, isGit, store, opts });
  const part = partitionFor(model, rel);
  if (!part) return { error: `no partition covers ${rel}` };
  const cands = all.filter(s => s.rel === rel && s.kind !== 'module').map(hydrateScope);
  if (!cands.length) return { error: `no scopes indexed for ${rel} (is it committed and parsed?)` };
  const s = name ? cands.find(x => x.name === name) : cands.length === 1 ? cands[0] : null;
  if (!s)
    return {
      error: name
        ? `no scope named ${name} in ${rel}`
        : `pick one scope of ${rel}: ${cands.map(x => `${x.kind} ${x.name} (line ${x.line})`).join(' · ')}`,
      cands,
    };
  applyVocab(s, part.vocab);
  const positive = Object.entries(s.preds).filter(
    ([pid, v]) => v !== 'false' && !/^auto\.(has|stshape|dir\d|mod)/.test(pid)
  );
  return {
    scope: s,
    surfaces: positive.map(([pid, v]) => ({
      pid,
      value: v,
      statement: verb2({ pid, exp: v, kind: s.kind, heritageKind: heritageKindOf(pid, model) }, [s.name]),
    })),
  };
}
// `decide` and `seed` are one command under two names: `decide` names the three kinds of decision a maintainer can
// record (steer · boundary · waive), `seed` is the original spelling and keeps its own nouns in its own messages.
const DECIDE_SUBS = { steer: 'add', boundary: 'add-boundary' };
const cmdDecide = ctx =>
  cmdSeed({ ...ctx, args: [DECIDE_SUBS[ctx.args[0]] || ctx.args[0], ...ctx.args.slice(1)] });
async function cmdSeed({ model, root, isGit, store, args, opts, stamp }) {
  const sub = args[0];
  if (sub === 'list') {
    const { seeds, boundaries, waivers } = readSeeds(store);
    if (!seeds.length && !boundaries.length && !waivers.length)
      return [
        'no seeds — `grain seed add <path>#<name> --surfaces <pid,…> --note "…"` (pattern) or `grain seed add-boundary <from> --never-imports <to> --note "…"` (architecture) records a maintainer decision in .grain/seeds.jsonl',
        stamp(),
      ];
    return [
      ...seeds.map(
        sd =>
          `${sd.id}  ${sd.path}#${sd.name}  ${sd.pids.join(',')}  weight ${sd.weight}${sd.topic ? `  topic "${sd.topic}"` : ''}${sd.note ? `  — ${sd.note}` : ''}  (${[sd.author, sd.createdAt].filter(Boolean).join(' ')})`
      ),
      ...boundaries.map(
        bd =>
          `${bd.id}  boundary: ${bd.boundary.from}/ never imports ${bd.boundary.to}/${bd.note ? `  — ${bd.note}` : ''}  (${[bd.author, bd.createdAt].filter(Boolean).join(' ')})`
      ),
      ...waivers.map(
        wv =>
          `${wv.id}  waiver: ${wv.path}#${wv.name} on ${wv.pid}${wv.note ? `  — ${wv.note}` : ''}  (${[wv.author, wv.createdAt].filter(Boolean).join(' ')})`
      ),
      stamp(),
    ];
  }
  if (sub === 'rm') {
    const id = args[1];
    if (!id) throw new Error('usage: grain seed rm <id>');
    const lines = existsSync(store.seedsPath) ? readFileSync(store.seedsPath, 'utf8').split('\n') : [];
    const kept = lines.filter(l => {
      try {
        return l.trim() && JSON.parse(l).id !== id;
      } catch {
        return !!l.trim();
      }
    });
    if (kept.length === lines.filter(l => l.trim()).length) throw new Error(`no seed with id ${id}`);
    atomicWrite(store.seedsPath, kept.join('\n') + (kept.length ? '\n' : ''));
    appendDecision(store, {
      action: 'rm',
      id,
      at: new Date().toISOString().slice(0, 10),
      by: opts.author || process.env.USER || '',
    });
    return [`removed seed ${id} — the next query re-mines without it`, stamp()];
  }
  if (sub === 'add') {
    const target = args[1];
    if (!target)
      throw new Error(
        'usage: grain seed add <path>[#<scope name>] [--surfaces <pid,…>] [--instead-of <pid,…>] [--weight N] [--topic "…"] [--note "…"] [--author X]'
      );
    const [p0, name] = target.split('#');
    const rel = relPath(root, p0);
    const r = await scopeSurfaces({ model, store, rel, name, root, isGit, opts });
    if (r.error) return [r.error, stamp()];
    const want = opts.surfaces
      ? String(opts.surfaces)
          .split(',')
          .map(x => x.trim())
          .filter(Boolean)
      : [];
    const retire = opts['instead-of']
      ? String(opts['instead-of'])
          .split(',')
          .map(x => x.trim())
          .filter(Boolean)
      : [];
    if (!want.length)
      return [
        `${rel}#${r.scope.name} (${r.scope.kind}, line ${r.scope.line}) carries these surfaces — choose which to promote and re-run with --surfaces <pid,…> (optionally --instead-of <pid,…> naming what it replaces):`,
        ...r.surfaces.map(x => `  ${x.pid} = ${x.value}    ${x.statement}`),
        '(a seed without surfaces is refused: grain will not guess which property you meant)',
        stamp(),
      ];
    const bad = want.filter(pid => r.scope.preds[pid] === undefined);
    if (bad.length)
      throw new Error(
        `${rel}#${r.scope.name} has no surface ${bad.join(', ')} — run \`grain seed add ${target}\` without --surfaces to see them`
      );
    // the retired surface must be one the exemplar does NOT carry (its value there is 'false'): the seed then mutes the old
    // rule wherever it fires and `check` reports carriers of the retired value as departing from the decision
    const badR = retire.filter(pid => r.scope.preds[pid] !== 'false');
    if (badR.length)
      throw new Error(
        `--instead-of ${badR.join(', ')}: the exemplar ${r.scope.name} ${r.scope.preds[badR[0]] === undefined ? 'has no such surface' : 'itself carries that value'} — name a surface the exemplar has retired (its value on the exemplar is 'false')`
      );
    const createdAt = new Date().toISOString().slice(0, 10);
    const author = opts.author || process.env.USER || '';
    const id = createHash('sha256')
      .update([rel, r.scope.name, want.concat(retire).join(','), author, createdAt].join('|'))
      .digest('hex')
      .slice(0, 8);
    if (readSeeds(store).seeds.some(sd => sd.id === id))
      return [
        `seed ${id} already exists for ${rel}#${r.scope.name} on ${want.join(',')} — \`grain seed rm ${id}\` first to change it`,
        stamp(),
      ];
    // a creation-time snapshot of how widely the FIRST promoted surface was already practiced — read back by
    // `report`/`where` so a later reader can see whether adoption has moved since the decision was made, without
    // keeping their own notes. null when the exemplar's partition never mined a partition-wide (`_all:`) fact for
    // this (kind, pid) — a brand-new pattern, or one whose accepted convention lives only at a group/directory
    // context this snapshot deliberately does not chase (see `baselineShare` in core.mjs for the trade-off)
    const baseline = (() => {
      const b = baselineShare(model, rel, r.scope.kind, want[0], r.scope.preds[want[0]]);
      return b ? { ...b, at: createdAt } : null;
    })();
    const rec = {
      id,
      scope: { path: rel, name: r.scope.name },
      surfaces: want,
      retired: retire,
      weight: +opts.weight || 8,
      topic: opts.topic || '',
      note: opts.note || '',
      author,
      createdAt,
      baseline,
    };
    mkdirSync(store.base, { recursive: true });
    ensureSeedAttrs(store);
    appendFileSync(store.seedsPath, JSON.stringify(rec) + '\n');
    appendDecision(store, { action: 'add', id, at: createdAt, by: author, note: rec.note });
    return [
      `recorded seed ${id} in .grain/seeds.jsonl — ${want.map(pid => verb2({ pid, exp: r.scope.preds[pid], kind: r.scope.kind, heritageKind: heritageKindOf(pid, model) }, [r.scope.name])).join('; ')} (weight ${rec.weight}, capped at half the real population of each cell). Commit .grain/seeds.jsonl and .grain/decisions.jsonl; the next query re-mines with it.`,
      stamp(),
    ];
  }
  // a waiver excuses ONE scope from ONE convention. Its key is (path, name, pid) and `checkFile` matches it by that
  // key alone — so an ambiguous target (two scopes of one file sharing a name: overloads, methods of sibling classes)
  // would silently waive the wrong one. Refuse it here, with `seed add`'s own wording for the same situation.
  if (sub === 'waive') {
    const target = args[1];
    const pid = typeof opts.on === 'string' ? opts.on : null;
    if (!target || !pid)
      throw new Error('usage: grain decide waive <path>#<name> --on <pid> --note "…" [--author X]');
    const [p0, name] = target.split('#');
    const rel = relPath(root, p0);
    if (!name)
      throw new Error(
        `grain decide waive names one scope: ${rel}#<scope name> (a waiver excuses a scope, never a whole file)`
      );
    const all = await loadScopes({ root, isGit, store, opts });
    const cands = all.filter(s => s.rel === rel && s.kind !== 'module' && s.name === name);
    if (!cands.length) return [`no scope named ${name} in ${rel}`, stamp()];
    if (cands.length > 1)
      return [
        `pick one scope of ${rel}: ${cands.map(x => `${x.kind} ${x.name} (line ${x.line})`).join(' · ')} — a waiver names exactly one, and \`${name}\` here names ${cands.length}`,
        stamp(),
      ];
    const createdAt = new Date().toISOString().slice(0, 10);
    const author = opts.author || process.env.USER || '';
    const id = createHash('sha256')
      .update(['waiver', rel, name, pid, author, createdAt].join('|'))
      .digest('hex')
      .slice(0, 8);
    if (readSeeds(store).waivers.some(wv => wv.id === id))
      return [
        `waiver ${id} already exists for ${rel}#${name} on ${pid} — \`grain decide rm ${id}\` first to change it`,
        stamp(),
      ];
    mkdirSync(store.base, { recursive: true });
    ensureSeedAttrs(store);
    appendFileSync(
      store.seedsPath,
      JSON.stringify({ id, waiver: { path: rel, name, pid }, note: opts.note || '', author, createdAt }) +
        '\n'
    );
    appendDecision(store, { action: 'add', id, at: createdAt, by: author, note: opts.note || '' });
    return [
      `recorded waiver ${id} in .grain/seeds.jsonl — ${rel}#${name} (line ${cands[0].line}) is excused from ${pid}. \`check\` will say the departure is deliberate instead of flagging it; the counts still report it as non-conforming. Commit .grain/seeds.jsonl and .grain/decisions.jsonl.`,
      stamp(),
    ];
  }
  if (sub === 'add-boundary') {
    const from = args[1];
    const to = opts['never-imports'];
    if (!from || !to)
      throw new Error(
        'usage: grain seed add-boundary <fromDir> --never-imports <toDir> --note "…" [--author X]'
      );
    const fromDir = String(from).replace(/\/$/, ''),
      toDir = String(to).replace(/\/$/, '');
    const createdAt = new Date().toISOString().slice(0, 10);
    const author = opts.author || process.env.USER || '';
    const id = createHash('sha256')
      .update(['boundary', fromDir, toDir, author, createdAt].join('|'))
      .digest('hex')
      .slice(0, 8);
    if (readSeeds(store).boundaries.some(bd => bd.id === id))
      return [`boundary ${id} already exists — \`grain seed rm ${id}\` first to change it`, stamp()];
    const mg = model.moduleGraph;
    const existing = (mg?.edges || []).filter(
      e => (e.from + '/').startsWith(fromDir + '/') && (e.to + '/').startsWith(toDir + '/')
    );
    mkdirSync(store.base, { recursive: true });
    ensureSeedAttrs(store);
    appendFileSync(
      store.seedsPath,
      JSON.stringify({
        id,
        boundary: { from: fromDir, to: toDir },
        note: opts.note || '',
        author,
        createdAt,
      }) + '\n'
    );
    appendDecision(store, { action: 'add-boundary', id, at: createdAt, by: author, note: opts.note || '' });
    return [
      `recorded boundary ${id} in .grain/seeds.jsonl — ${fromDir}/ never imports ${toDir}/. ${
        existing.length
          ? `NOTE: the graph already holds ${existing.length} module edge(s) crossing it (${existing
              .slice(0, 3)
              .map(e => `${e.from}→${e.to} ×${e.n}`)
              .join(' · ')}) — existing code is a transition, new code will be flagged by \`check\`.`
          : 'No existing edges cross it.'
      } Commit .grain/seeds.jsonl and .grain/decisions.jsonl.`,
      stamp(),
    ];
  }
  throw new Error(
    'usage: grain decide steer|boundary|waive|list|rm … (grain seed add|add-boundary|list|rm is the same command)'
  );
}
// the whole model as data — see export.mjs
async function cmdExport({ model, meta, head, root, isGit, args, opts, stamp, store }) {
  if (args.length)
    throw new Error(
      'usage: grain export [--out <file>] [--max-sites N] [--compact] [--no-anchors] — takes no arguments'
    );
  const scopesAll = await loadScopes({ root, isGit, store, opts });
  let H = null;
  if (isGit && !opts['no-history']) {
    try {
      H = (await loadHistory({ gitdir: root, store, log })).H;
    } catch (e) {
      log('history unavailable for export: ' + e.message);
    }
  }
  const dump = exportModel({
    model,
    root,
    scopesAll,
    H,
    meta,
    head,
    maxSites: opts['max-sites'] !== undefined ? +opts['max-sites'] : 300,
    anchors: !opts['no-anchors'],
  });
  const text = JSON.stringify(dump, null, opts.compact ? 0 : 1);
  if (opts.out) {
    const p = isAbsolute(opts.out) ? opts.out : resolve(process.cwd(), opts.out);
    atomicWrite(p, text);
    return [
      `export ${p} — ${dump.summary.conventions} conventions · ${dump.summary.groups} groups · ${dump.summary.deviations} deviating sites · ${dump.cochange.length} co-change pairs · ${(text.length / 1048576).toFixed(1)} MB`,
      stamp(),
    ];
  }
  console.error('[grain] ' + stamp());
  return [text];
}
// ----- propose: one command from `git clone` to a loadable `.yggdrasil/` architecture graph -----
//
// The staging tree is written to `<repo>/.yggdrasil-proposal/` by default and NEVER to `<repo>/.yggdrasil/`: a
// proposal is read, edited and moved in by a human, not installed by a script. The out-dir gets its own
// `.gitignore` (`*`, the same trick `.grain/.gitignore` uses for the cache) the first time it is written, so a
// staging tree can never be committed by accident while the maintainer reads it.
//
// Everything the command prints comes from `proposeReport` (engine/propose.mjs), which builds the text lines and
// the `--json` document in one pass so the two cannot disagree. The default is deliberately quiet — see that
// function's header for what is in it and why.
async function cmdPropose({ root, args, opts, stamp }) {
  if (args.length > 1)
    throw new Error('usage: grain propose [<out-dir>] [--full] [--json <path>] [--holdout <YYYY-MM-DD>] — at most one out-dir');
  if (opts.json === true)
    throw new Error('usage: grain propose --json <path> — `--json` names the file to write the report to; the text report always goes to stdout');
  if (opts.holdout !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(String(opts.holdout)))
    throw new Error('usage: grain propose --holdout <YYYY-MM-DD> — a calendar date, so drill corpora keep only sites first seen after it');
  const outDir = args[0]
    ? isAbsolute(args[0]) ? args[0] : resolve(process.cwd(), args[0])
    : join(root, '.yggdrasil-proposal');
  // CANONICAL PATHS, NOT RESOLVED STRINGS. `resolve()` folds `.` and `..` and never touches the filesystem, so
  // an out-dir that is a SYMLINK to the repository compares unequal to it, walks past this guard, and the
  // renderer's `rmSync(<out-dir>/.yggdrasil)` then deletes the hand-written graph the guard exists to protect —
  // measured, exit code 0, no warning. `canonicalize` (above) resolves symlinks through the deepest existing
  // ancestor, so it works on an out-dir that does not exist yet, which is the ordinary case.
  const outReal = canonicalize(outDir), rootReal = canonicalize(root), yggReal = canonicalize(join(root, '.yggdrasil'));
  if (outReal === rootReal || outReal === yggReal || outReal.startsWith(yggReal + sep))
    throw new Error(
      `refusing to write a proposal into ${outReal}: that is the repository itself or its own .yggdrasil/.\n` +
        'A proposal is a staging tree a human reads, edits and moves in — writing it over a live graph destroys the graph already there.\n' +
        `Run \`grain propose\` with no argument (it writes ${join(root, '.yggdrasil-proposal')}), or name a directory outside .yggdrasil/.`
    );
  const { propose, proposeReport } = await import('./propose.mjs');
  const r = await propose(root, outDir, { noHistory: !!opts['no-history'], holdout: opts.holdout });
  // `*` ignores the staging tree including this file — the same self-ignoring form `.grain/.gitignore` uses, so
  // an adopter reading a proposal for a week never has it show up in `git status`.
  const gi = join(outDir, '.gitignore');
  if (!existsSync(gi))
    writeFileSync(gi, '# generated by grain — a proposal is a staging tree you read and move in, never a commit\n*\n');
  const { lines, json } = proposeReport(r, { outDir, root, full: !!opts.full });
  if (opts.json) {
    const p = isAbsolute(opts.json) ? opts.json : resolve(process.cwd(), opts.json);
    atomicWrite(p, JSON.stringify(json, null, 1) + '\n');
    lines.push(`report as JSON: ${p}`);
  }
  return [...lines, stamp()];
}
// ----- main -----
export async function main(argv) {
  const { cmd, args, opts } = parseArgv(argv);
  const { root, git: isGit } = findRoot(opts);
  const store = storeFor(root);
  if (!cmd || cmd === 'help' || opts.help) {
    console.log(USAGE);
    return 0;
  }
  if (cmd === 'session-context') {
    // hook path: never fails the session, never rebuilds, honours the host's cwd from the stdin payload
    try {
      let r = { root, isGit, store };
      const cwd = hookCwd();
      if (cwd && cwd !== process.cwd()) {
        const f = findRoot({ repo: cwd });
        r = { root: f.root, isGit: f.git, store: storeFor(f.root) };
      }
      console.log(JSON.stringify(sessionContext({ ...r, mode: opts.mode || args[0] || 'claude' })));
    } catch (e) {
      // (§029) deliberately UNGATED, unlike the other five hooks' `if (process.env.GRAIN_DEBUG)` catch blocks below:
      // this hook runs once per session (not once per edit/prompt), so the noise cost of speaking is low, while a
      // broken repo path here silently drops grain's entire SessionStart context for the whole session with no other
      // signal — worth surfacing immediately rather than requiring a user to already know to set GRAIN_DEBUG.
      console.error('[grain] session-context failed: ' + e.message);
    }
    return 0;
  }
  if (cmd === 'check-hook') {
    // PostToolUse hook: grain comes to the agent after every edit — speaks ONLY when it has
    // findings on the touched lines (deviations, maintainer decisions, architecture), never builds or refreshes, never blocks
    try {
      let payload = null;
      try {
        if (!process.stdin.isTTY) {
          const raw = readFileSync(0, 'utf8');
          if (raw.trim()) payload = JSON.parse(raw);
        }
      } catch {
        /* no payload → nothing to check */
      }
      const fp = payload?.tool_input?.file_path || payload?.tool_input?.filePath || payload?.file_path;
      if (!fp) return 0;
      const f = findRoot({ repo: typeof payload?.cwd === 'string' ? payload.cwd : process.cwd() });
      const st2 = storeFor(f.root);
      const fpr = canonicalize(fp);
      const meta2 = readJson(st2.metaPath);
      const model2 = meta2 && existsSync(st2.modelPath) ? readJson(st2.modelPath) : null;
      if (
        !model2 ||
        meta2.engine !== ENGINE_VERSION ||
        meta2.extractor !== EXTR_V ||
        (meta2.model || '') !== MODEL_V
      )
        return 0; // stale schema: silence, the next real query rebuilds
      const rel = relPath(f.root, fpr);
      const stamp2 = d => `as of ${short(meta2.headSha)}${d ? '+dirty' : ''}`;
      let speak;
      let pre = false;
      if (opts.pre) {
        // PreToolUse on Write: the file does not exist yet — placement speaks from the PATH alone, BEFORE
        // the worker sinks cost into the wrong directory (measured, replay-3: a post-write note was followed only while
        // moving was still cheap; the stronger, later note lost to sunk cost)
        pre = true;
        const ph = placementHit(model2, rel);
        if (ph) recordPlacementPending(st2, ph, rel); // feedback loop: did a later write to this suffix/token land in `ph.dir`? resolved on a matching PostToolUse below
        speak = ph ? [ph.text] : [];
        // §088: `obligation <path>` at the SAME pre-write moment placement already speaks at — but ONLY when the
        // birth-obligation table actually CERTIFIES a specific companion for this path's (module, suffix) class
        // (`rules.length`), never on ambient-only or "born N times, nothing certifies" (§073's own honest-silence
        // case). Ticket 081 measured 0 of 8 real trial creation events certifying anything here — firing a hollow
        // note on nearly every Write would be exactly the class-018 over-hedging this project avoids, so this
        // must stay silent far more often than it speaks; `rules.length` alone (never `ambient.length` alone) is
        // the gate, since ambient files are explicitly NOT an obligation (core.mjs, certifyObligationRules) and
        // are common enough across classes that gating on them too would blow past a single-low-digits fire rate.
        const obl = obligationFor(model2, rel);
        if (obl.rules.length) {
          const kindWord = obl.suffix ? `*.${obl.suffix}` : '(no extension)';
          const dirWord = obl.module === '.' ? 'the repo root' : obl.module + '/';
          const specific = obl.rules
            .slice(0, 3)
            .map(r => `${r.file} (${r.k} of ${r.n})`)
            .join(' · ');
          const amb = obl.ambient.length
            ? ` · ambient (touched by almost everything regardless): ${obl.ambient
                .slice(0, 3)
                .map(a => `${a.file} (${a.k} of ${a.n})`)
                .join(' · ')}`
            : '';
          speak = [
            ...speak,
            `[grain] ${voice('practiced', `obligation: a new ${kindWord} under ${dirWord} has come with: ${specific}${amb} — \`grain obligation ${rel}\` for the full table.`)}`,
          ];
        }
      } else {
        resolvePlacementPending(st2, f.root, rel); // silent — never adds to the hook's spoken output, only updates local state
        if (!EXT2GRAMMAR[extname(rel)] || !existsSync(join(f.root, rel))) return 0;
        const lines = await cmdCheck({
          model: model2,
          root: f.root,
          isGit: f.git,
          args: [rel],
          opts: {},
          stamp: stamp2,
          store: st2,
        });
        speak = lines.filter(l => l.includes('[grain]')); // only findings — headers, conforms-to and the stamp stay in the direct command
        // co-change: a separate, single-line finding — capped to 3 partners, folded into the same signature/suppression
        // below as the check findings, so it speaks unbidden but repeats no more often than they do
        const cc = cochangeData(model2, [rel]); // same data source `missingLines`' co-change line reads — only the DATA changed here, not this line's own rendering
        if (cc.length) {
          // shared `cochange:<rel>` key with edit-hook's own PreToolUse co-change line (§J6.4): Edit fires
          // PreToolUse (edit-hook) then PostToolUse (here) in the same turn, so without this both would print the
          // same partners in one turn. Gated on the underlying DATA signature, not either hook's own wording (the
          // two render different sentences) — whichever fires first silences the other for the TTL, while this
          // hook's OTHER findings (`speak` above) keep speaking on their own `check:` cadence below regardless.
          const ccSig = cc.map(h => `${h.file}:${h.sup}/${h.commits}:${h.dead ? 1 : 0}`).join(',');
          if (seenGate(st2, 'cochange:' + rel, ccSig))
            speak = [
              ...speak,
              `[grain] ${voice(
                'practiced',
                `edits like this also touch: ${cc
                  .slice(0, 3)
                  .map(
                    h =>
                      `${h.file}${h.dead ? ' (deleted)' : ''} (co-changed in ${h.sup}/${h.commits} commits)`
                  )
                  .join(' · ')}`
              )}`,
            ];
        }
      }
      if (!speak.length) return 0;
      // repeat suppression: an agent editing the same file five times must not read the same note five times — an
      // UNCHANGED set of findings for a file repeats only after the TTL; any change in the findings speaks at once.
      // Namespaced `check:` — hook-seen.json is shared with every other unbidden hook (§J6.1's seenGate).
      if (!seenGate(st2, 'check:' + rel, speak.join('\n'))) return 0;
      const text = [
        ...speak.slice(0, 8),
        ...(speak.length > 8 ? [`  (+${speak.length - 8} more — run \`grain check ${rel}\`)`] : []),
        stamp2(true),
      ].join('\n');
      // no `permissionDecision` here (Pre or Post): the live docs say `additionalContext` is delivered regardless
      // of it, so omitting it leaves the user's normal Write permission prompt intact instead of auto-approving it
      console.log(
        JSON.stringify(
          pre
            ? { hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } }
            : { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } }
        )
      );
    } catch (e) {
      if (process.env.GRAIN_DEBUG)
        console.error('[grain] check-hook: ' + (e?.stack || e)); /* a hook never breaks an edit */
    }
    return 0;
  }
  if (cmd === 'edit-hook') {
    // PreToolUse hook on Edit|MultiEdit (§J6.4): co-change partners for the file about to
    // be touched, from this repo's own history — BEFORE the edit lands, so an agent about to touch one half of an
    // established pair learns about the other half while it is still cheap to touch both in one edit. Deliberately
    // co-change ONLY, no kin: `missingLines`'s name-stem half needs `newFileScopes[rel]`, which `cmdReview` only
    // ever populates for a file NOT already known — but a file under `Edit` is by definition already committed, so
    // that half is structurally always empty here, not an approximation; the value half would need a full parse of
    // the file on the hot path of every single Edit for HEAD-state information unrelated to the pending change. No
    // `permissionDecision` — same cross-ticket rule as check-hook/how-hook/commit-hook: `additionalContext` reaches
    // the agent regardless of it, so omitting it leaves the user's own Edit permission prompt untouched.
    try {
      let payload = null;
      try {
        if (!process.stdin.isTTY) {
          const raw = readFileSync(0, 'utf8');
          if (raw.trim()) payload = JSON.parse(raw);
        }
      } catch {
        /* no payload → nothing to say */
      }
      const fp = payload?.tool_input?.file_path || payload?.tool_input?.filePath || payload?.file_path;
      if (!fp) return 0;
      const f = findRoot({ repo: typeof payload?.cwd === 'string' ? payload.cwd : process.cwd() });
      const st2 = storeFor(f.root);
      const meta2 = readJson(st2.metaPath);
      const model2 = meta2 && existsSync(st2.modelPath) ? readJson(st2.modelPath) : null;
      if (
        !model2 ||
        meta2.engine !== ENGINE_VERSION ||
        meta2.extractor !== EXTR_V ||
        (meta2.model || '') !== MODEL_V
      )
        return 0; // stale schema: silence, the next real query rebuilds
      const rel = relPath(f.root, canonicalize(fp));
      const cc = cochangeData(model2, [rel]); // same data source check-hook's own PostToolUse co-change line reads
      if (!cc.length) return 0;
      // shared `cochange:<rel>` key with check-hook's own PostToolUse co-change line (§J6.4's cross-ticket note
      // above) — gated on the underlying DATA signature so the two hooks' differently-worded sentences still
      // suppress each other correctly. Edit fires PreToolUse (this hook) before PostToolUse (check-hook) in the
      // same turn, so this hook wins the race and check-hook's own copy of the same line stays silent.
      const ccSig = cc.map(h => `${h.file}:${h.sup}/${h.commits}:${h.dead ? 1 : 0}`).join(','); // must match check-hook's own ccSig format byte-for-byte — they share the 'cochange:'+rel seenGate key
      if (!seenGate(st2, 'cochange:' + rel, ccSig)) return 0;
      const text = `[grain] ${voice(
        'practiced',
        `before you edit ${rel}, note: edits like this also touch: ${cc
          .slice(0, 3)
          .map(h => `${h.file}${h.dead ? ' (deleted)' : ''} (co-changed in ${h.sup}/${h.commits} commits)`)
          .join(' · ')}`
      )}`;
      console.log(
        JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } })
      );
    } catch (e) {
      if (process.env.GRAIN_DEBUG)
        console.error('[grain] edit-hook: ' + (e?.stack || e)); /* a hook never blocks an edit */
    }
    return 0;
  }
  if (cmd === 'read-hook') {
    // PostToolUse hook on Read (§J6.2): the file just read is itself one of a fact's TOP-5
    // deviants (`topDeviants`, core.mjs — a 6th-ranked deviant is correctly silent, not a bug) — "don't copy what
    // you just read", pointed at a conforming sibling elsewhere. Never parses the file; pure model lookup.
    try {
      let payload = null;
      try {
        if (!process.stdin.isTTY) {
          const raw = readFileSync(0, 'utf8');
          if (raw.trim()) payload = JSON.parse(raw);
        }
      } catch {
        /* no payload → nothing to check */
      }
      const fp = payload?.tool_input?.file_path || payload?.tool_input?.filePath || payload?.file_path;
      if (!fp) return 0;
      const f = findRoot({ repo: typeof payload?.cwd === 'string' ? payload.cwd : process.cwd() });
      const st2 = storeFor(f.root);
      const meta2 = readJson(st2.metaPath);
      const model2 = meta2 && existsSync(st2.modelPath) ? readJson(st2.modelPath) : null;
      if (
        !model2 ||
        meta2.engine !== ENGINE_VERSION ||
        meta2.extractor !== EXTR_V ||
        (meta2.model || '') !== MODEL_V
      )
        return 0; // stale schema: silence, the next real query rebuilds
      const rel = relPath(f.root, canonicalize(fp));
      const part2 = partitionFor(model2, rel);
      if (!part2) return 0; // no group covers this file — never speak
      // among every fact whose top-5 deviants include this file, the one where THIS file's own deviation is
      // strongest (largest gap) — ties keep the first encountered (facts are already in a deterministic array order)
      let best = null,
        bestGap = -Infinity;
      for (const fct of part2.facts) {
        const dev = (fct.deviants || []).find(d => d.rel === rel);
        if (dev && dev.gap > bestGap) {
          bestGap = dev.gap;
          best = { fct, dev };
        }
      }
      if (!best) return 0;
      const { fct, dev } = best;
      // "a conforming sibling": the same two guards checkFile's own inline exemplar render uses (core.mjs) —
      // never the file just read (a sibling is a DIFFERENT file), and re-validated to still exist on disk (a
      // model's exemplars can point at paths deleted since the index was built)
      const exOk = existsMemo(f.root);
      const near = (fct.exemplars || []).filter(e => exOk(e.rel) && e.rel !== rel)[0];
      if (!near) return 0; // nothing left to point at — a bare "don't copy this" with no alternative isn't worth speaking
      const conformN = fct.sraw - Math.round((1 - fct.share) * fct.sraw);
      const text = `[grain] ${voice(
        'practiced',
        `note: this file departs from its group on ${verbalize(
          fct,
          fct.exemplars.map(e => e.name)
        )} (line ${dev.line}) — don't copy that part; a conforming sibling: ${ptr(near.rel, near.line, near.endLine)} \`${near.name}\`${skipLineNote(part2, fct, near)} — ${conformN}/${fct.sraw} established do it the other way`
      )}`;
      // namespaced `read:` — hook-seen.json is shared with check-hook's `check:` and how-hook's `how:` (§J6.1's seenGate)
      if (!seenGate(st2, 'read:' + rel, text)) return 0;
      console.log(
        JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: text } })
      );
    } catch (e) {
      if (process.env.GRAIN_DEBUG)
        console.error('[grain] read-hook: ' + (e?.stack || e)); /* a hook never breaks a read */
    }
    return 0;
  }
  if (cmd === 'how-hook') {
    // UserPromptSubmit hook: `how` speaks unbidden ONLY when the prompt itself resembles a
    // certified change archetype or strongly matches ≥2 past commits — never builds or refreshes the index or the
    // history cache (same "never builds, never refreshes" contract check-hook already holds on its hot path)
    try {
      let payload = null;
      try {
        if (!process.stdin.isTTY) {
          const raw = readFileSync(0, 'utf8');
          if (raw.trim()) payload = JSON.parse(raw);
        }
      } catch {
        /* no payload → nothing to say */
      }
      const prompt = payload?.prompt;
      if (typeof prompt !== 'string' || !prompt.trim()) return 0;
      // a slash command / skill / sub-agent request is already a deliberate, chosen action — only a prompt the
      // user actually typed gets grain's unsolicited opinion
      if (payload.prompt_source && payload.prompt_source !== 'user_input') return 0;
      const f = findRoot({ repo: typeof payload?.cwd === 'string' ? payload.cwd : process.cwd() });
      if (!f.git) return 0;
      const st2 = storeFor(f.root);
      const meta2 = readJson(st2.metaPath);
      const model2 = meta2 && existsSync(st2.modelPath) ? readJson(st2.modelPath) : null;
      if (
        !model2 ||
        meta2.engine !== ENGINE_VERSION ||
        meta2.extractor !== EXTR_V ||
        (meta2.model || '') !== MODEL_V
      )
        return 0; // stale schema: silence, the next real query rebuilds
      const head = headSha(f.root);
      if (!head) return 0;
      // read-only: history.json is read directly and used ONLY if already fresh (lastSha === head) — this hook
      // must never take the `loadHistory` walk-and-write path (that is what "never refreshes" forbids here).
      // history.json is newline-delimited, not one JSON object (§055) — read through history.mjs's own
      // `readHistoryState`, never the generic `readJson` every other cache file here uses; any read failure
      // (missing, corrupt, mid-write) degrades exactly like `readJson` always has — `state = null`, hook stays silent.
      let state = null;
      if (existsSync(st2.historyPath)) {
        try {
          state = await readHistoryState(st2.historyPath);
        } catch {
          state = null;
        }
      }
      if (!state || state.x !== EXTR_V || state.h !== HIST_V || state.lastSha !== head) return 0;
      const H = { fps: state.fps || [] }; // the only field howCmd ever reads off H
      if (!H.fps.length) return 0;
      const { matches, places, shape } = howCmd({
        model: model2,
        H,
        query: prompt,
        top: 3,
        msgOf: null,
        shapes: true,
        exemplarOk: existsMemo(f.root),
      });
      const certified = shape && (shape.cells || []).some(c => c.certified); // J4.1's own gate: a shape with nothing certified never reaches model.changeArchetypes in the first place
      const strong = matches.filter(m => m.score >= 0.5).length >= 2; // an UNSOLICITED injection earns a stricter bar than a query the user typed on purpose (howCmd's own weak-match floor is 0.34)
      if (!certified && !strong) return 0; // never gate on howCmd's own `lines` — it is never empty, even at zero matches
      const lines = [];
      if (certified)
        lines.push(
          `certified shape "${shape.label}" (${shape.n} changes): ${shape.cells.map(c => `${archCellLabel(model2, c.cell)} (${c.k} of ${shape.n})`).join(' · ')}`
        );
      const relPlaces = places.filter(p => p.k >= 2); // a place touched by only 1 of the matched commits is one anecdote, not a place "such a change touched"
      if (relPlaces.length) {
        lines.push('places such a change touched:');
        for (const p of relPlaces)
          lines.push(`  ${p.rel} (${p.k}/${p.of}) — ${p.exists ? p.module : '(deleted)'}`);
      }
      if (!lines.length) return 0;
      const text = lines.slice(0, 6).join('\n');
      // namespaced `how:` (hook-seen.json is shared with check-hook's `check:` and future hooks) — keyed on the
      // matched commit set, not the raw prompt: two differently-worded prompts landing on the same evidence are
      // the same reminder, and TTL-suppress each other
      const key =
        'how:' +
        createHash('sha256')
          .update(
            matches
              .map(m => m.sha)
              .sort()
              .join(',')
          )
          .digest('hex')
          .slice(0, 16);
      if (!seenGate(st2, key, text)) return 0;
      console.log(
        JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: text } })
      );
    } catch (e) {
      if (process.env.GRAIN_DEBUG)
        console.error('[grain] how-hook: ' + (e?.stack || e)); /* a hook never breaks a prompt */
    }
    return 0;
  }
  if (cmd === 'commit-hook') {
    // PreToolUse hook on Bash (§J6.3): a `git commit` about to run — review the change
    // it is about to record, ahead of the commit. Never blocks: no `permissionDecision` here either (same
    // cross-ticket note as check-hook/how-hook — `additionalContext` reaches the agent regardless of it, so
    // omitting it leaves the user's own commit permission prompt untouched instead of auto-approving it).
    try {
      let payload = null;
      try {
        if (!process.stdin.isTTY) {
          const raw = readFileSync(0, 'utf8');
          if (raw.trim()) payload = JSON.parse(raw);
        }
      } catch {
        /* no payload → nothing to review */
      }
      const command = payload?.tool_input?.command;
      if (typeof command !== 'string' || !command.trim()) return 0;
      // best-effort heuristic, not a shell parser: anchored on a command-start boundary so a chained (`&&`/`;`/`|`/
      // newline) or `git -C <path>`/`git --no-pager` commit is still caught; the lazy `[^;&|\n]*?` stops at the
      // FIRST "commit" after "git" so a later "commit" inside a quoted -m message can't swallow the real flags.
      // Misses git aliases (`git ci`) and anything shell-quoted around the keywords themselves — known, accepted gaps.
      const m = /(^|[;&|]\s*|\n)\s*git\b[^;&|\n]*?\bcommit\b/.exec(command);
      if (!m) return 0;
      const tailEnd = (() => {
        const rel = command.slice(m.index + m[0].length).search(/[;&|\n]/);
        return rel === -1 ? command.length : m.index + m[0].length + rel;
      })();
      const tail = command.slice(m.index + m[0].length, tailEnd); // this invocation's own flags/args after "commit" — never another chained command's
      if (/--help\b|(^|\s)-h\b/.test(tail)) return 0; // `git commit --help`/`-h` never actually commits
      const f = findRoot({ repo: typeof payload?.cwd === 'string' ? payload.cwd : process.cwd() });
      if (!f.git) return 0;
      const st2 = storeFor(f.root);
      const meta2 = readJson(st2.metaPath);
      const model2 = meta2 && existsSync(st2.modelPath) ? readJson(st2.modelPath) : null;
      if (
        !model2 ||
        meta2.engine !== ENGINE_VERSION ||
        meta2.extractor !== EXTR_V ||
        (meta2.model || '') !== MODEL_V
      )
        return 0; // stale schema: silence, the next real query rebuilds
      // `-a`/`-am`/`--all`, or a combined short-flag cluster with `a` right after its own `-` (e.g. `-am`, `-ma`):
      // git stages AT commit time, so nothing is in the index yet here — `--staged` would silently review an
      // empty diff exactly when the change is largest. Fall back to the default worktree diff (HEAD diff + untracked) instead.
      const usesAll = /(^|\s)(--all\b|-[a-zA-Z]*a[a-zA-Z]*\b)/.test(tail);
      const reviewOpts = usesAll ? {} : { staged: true };
      const stagedFiles = reviewFileList(f.root, reviewOpts);
      if (!stagedFiles.length) return 0; // nothing to review — stay silent, never speak "0 findings"
      const stamp2 = d => `as of ${short(meta2.headSha)}${d ? '+dirty' : ''}`;
      const lines = await cmdReview({
        model: model2,
        root: f.root,
        isGit: f.git,
        args: [],
        opts: reviewOpts,
        stamp: stamp2,
        store: st2,
      });
      if (lines.some(l => l.startsWith('clean — nothing to report'))) return 0; // nothing to report
      // repeat suppression keyed on the sorted staged (or worktree, for the `-a` fallback) file list, NOT the
      // review text: a commit of the SAME files with IDENTICAL findings repeats-suppresses even if incidental
      // text (e.g. the stamp) differs; a DIFFERENT file set is a different key and always speaks at once.
      // Namespaced `commit:` — hook-seen.json is shared with check-hook's `check:`, read-hook's `read:` and
      // how-hook's `how:` (§J6.1's seenGate).
      const key = 'commit:' + createHash('sha256').update(stagedFiles.join('\n')).digest('hex').slice(0, 16);
      if (!seenGate(st2, key, lines.slice(0, -1).join('\n'))) return 0; // signature excludes the trailing stamp line, same reason check-hook's own `speak` does
      const text = capReviewLines(lines, 5, 3).join('\n');
      console.log(
        JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', additionalContext: text } })
      );
    } catch (e) {
      if (process.env.GRAIN_DEBUG)
        console.error('[grain] commit-hook: ' + (e?.stack || e)); /* a hook never blocks a commit */
    }
    return 0;
  }
  if (cmd === 'version') {
    if (args.length) throw new Error('usage: grain version — takes no arguments');
    console.log(`grain ${ENGINE_VERSION} · extractor ${EXTR_V} · grammars ${GRAMMARS.join(', ')}`);
    return 0;
  }
  const want =
    cmd === 'refresh' ? 'force' : opts['no-refresh'] || process.env.GRAIN_NO_REFRESH ? 'none' : 'refresh';
  const { model, meta, head, banner, stale } = await ensureFresh({ root, isGit, store, opts, want });
  if (!model) {
    console.log(banner.join('\n'));
    return 2;
  }
  const stamp = dirty =>
    `as of ${short(stale ? meta?.headSha : head)}${dirty ? '+dirty' : ''}${stale ? ' (STALE)' : ''}`;
  const treeDirty = repoDirty(root, isGit); // §024c — computed once per invocation, shared by every HEAD-reading command below
  const ctx = { model, meta, head, root, isGit, args, opts, stamp, store, treeDirty };
  let lines;
  switch (cmd) {
    case 'where':
      lines = await cmdWhere(ctx);
      break;
    case 'how':
      lines = await cmdHow(ctx);
      break;
    case 'what':
      lines = await cmdWhat(ctx);
      break;
    case 'map':
      lines = await cmdMap(ctx);
      break;
    case 'obligation':
      lines = await cmdObligation(ctx);
      break;
    case 'check':
      lines = args.length === 0 ? await cmdReview(ctx) : await cmdCheck(ctx);
      break; // no file argument: `check` is an alias of `review` — the whole uncommitted change (J1.1)
    case 'review':
      lines = await cmdReview(ctx);
      break;
    case 'spectrum':
    case 'explain':
      lines = await cmdSpectrum(ctx);
      break;
    case 'status':
      lines = await cmdStatus(ctx);
      break;
    case 'report':
      lines = await cmdReport(ctx);
      break;
    case 'rules':
      lines = await cmdRules(ctx);
      break;
    case 'export':
      lines = await cmdExport(ctx);
      break;
    case 'propose':
      lines = await cmdPropose(ctx);
      break;
    case 'decide':
    case 'seed':
      lines = await cmdDecide(ctx);
      break;
    case 'refresh':
      if (args.length) throw new Error('usage: grain refresh [--full] — takes no arguments');
      lines = [...statusLines(model), ...freshnessLines(meta, head, isGit), stamp()];
      break;
    case 'completeness':
      lines = [
        ...completenessDirectional(
          model,
          args.map(a => relPath(root, a))
        ),
        ...(treeDirty ? [DIRTY_TREE_NOTE] : []),
        stamp(),
      ];
      break;
    // selftest (text) and mutate-test (always JSON, alias kept for the dev harness) are deliberately different
    // formats of the same underlying detection check — this asymmetry is intentional, not an oversight to fix
    case 'mutate-test':
      lines = [JSON.stringify(await mutateTest({ model, root }), null, 1), stamp()];
      break; // dev harness
    case 'selftest': {
      if (args.length)
        throw new Error(
          'usage: grain selftest [--json] | grain selftest --how [--last N] [--json] | grain selftest --where [--last N] [--json] | grain selftest --obligation [--last N] [--json] | grain selftest --extract [--json] — takes no positional arguments'
        );
      if (opts.extract) {
        // §3.B loop-v2: per-grammar declaration recall/precision against a node-types.json-derived oracle — no history needed, just the current tree
        let files = null,
          read = null;
        if (isGit) {
          try {
            const t = headTree(root);
            files = t.files;
            read = t.read;
          } catch (e) {
            log(
              'HEAD tree unavailable for selftest --extract, falling back to a worktree walk: ' + e.message
            );
          }
        }
        if (!files) files = [...walkFiles(root, root)].sort();
        const res = await extractCoverage({ root, files, read });
        if (opts.json) lines = [JSON.stringify({ ...res, asOf: stamp().replace(/^as of /, '') }, null, 1)];
        else {
          const f = x => (x == null ? 'n/a' : x.toFixed(2));
          const gLines = Object.entries(res.grammars)
            .sort((a, b) => (a[0] < b[0] ? -1 : 1))
            .map(([g, s]) =>
              s.boundary
                ? `${g}: boundary — no declaration-shaped node type in this grammar's own schema (scopes=${s.scopes})`
                : `${g}: recall=${f(s.recall)} precision=${f(s.precision)} candidates=${s.candidates} scopes=${s.scopes}`
            );
          lines = [
            ...gLines,
            `total: recall=${f(res.total.recall)} precision=${f(res.total.precision)} candidates=${res.total.candidates} scopes=${res.total.scopes}`,
            ...(res.noParse
              ? [`${res.noParse} file(s) could not be parsed and are excluded from these counts`]
              : []),
            stamp(),
          ];
        }
        break;
      }
      if (opts.where) {
        // J2.3's sibling: `where` ranked against the repository's own record of where an added file landed
        let H = null;
        if (isGit) {
          try {
            H = (await loadHistory({ gitdir: root, store, log })).H;
          } catch (e) {
            log('history unavailable for selftest --where: ' + e.message);
          }
        }
        if (!H || !H.fps || !H.fps.length) {
          const note = `selftest --where needs commit history to evaluate against (${!isGit ? 'this is not a git repository' : 'this repository has no readable commit history'})`;
          lines = opts.json
            ? [
                JSON.stringify({
                  note,
                  where: null,
                  base: null,
                  unnamed: null,
                  symbol: null,
                  n: 0,
                  silent: 0,
                  asOf: stamp().replace(/^as of /, ''),
                }),
              ]
            : [note, stamp()];
          break;
        }
        const res = whereEval({ model, H, last: +opts.last || 100 });
        if (opts.json) lines = [JSON.stringify({ ...res, asOf: stamp().replace(/^as of /, '') }, null, 1)];
        else {
          const f = x => x.toFixed(2);
          // cardW: the mean file-count of the cards that actually earned place@3 credit (§068) — surfaced right
          // next to the score so a wide, low-precision card inflating place@3 is visible here, not something a
          // researcher has to rediscover by hand
          const armLine = a => `hit@3=${f(a.hit3)} MRR=${f(a.mrr)} place@3=${f(a.place3)} cardW=${a.placeWidth.toFixed(1)}`;
          lines = [
            `where: ${armLine(res.where)} · path-match baseline: ${armLine(res.base)} · n=${res.n} · nothing-ranked=${res.silent}`,
            `query does not name the file (n=${res.unnamed.n}) — where: ${armLine(res.unnamed.where)} · baseline: ${armLine(res.unnamed.base)}`,
            // §071 — additive symbol stratum: candidates whose own commit message carried a verbatim identifier
            // (`sendStatus`, `send_status`), scored on a query that keeps it whole instead of only the
            // tokenize+normTok-split form the two lines above are stuck with
            `message names a symbol verbatim (n=${res.symbol.n}) — where: ${armLine(res.symbol.where)} · baseline: ${armLine(res.symbol.base)}`,
            stamp(),
          ];
        }
        break;
      }
      if (opts.how) {
        // BRAMKA J2.3: leave-one-out P/R of `how` vs a grep baseline, over the repo's own history — never the mutate-test path
        let H = null;
        if (isGit) {
          try {
            H = (await loadHistory({ gitdir: root, store, log })).H;
          } catch (e) {
            log('history unavailable for selftest --how: ' + e.message);
          }
        }
        if (!H || !H.fps || !H.fps.length) {
          const note = `selftest --how needs commit history to evaluate against (${!isGit ? 'this is not a git repository' : 'this repository has no readable commit history'})`;
          lines = opts.json
            ? [
                JSON.stringify({
                  note,
                  how: null,
                  grep: null,
                  n: 0,
                  noMatch: 0,
                  asOf: stamp().replace(/^as of /, ''),
                }),
              ]
            : [note, stamp()];
          break;
        }
        const res = howEval({ model, H, root, last: +opts.last || 100 });
        if (opts.json) lines = [JSON.stringify({ ...res, asOf: stamp().replace(/^as of /, '') }, null, 1)];
        else {
          const f = x => x.toFixed(2);
          lines = [
            `how: P=${f(res.how.meanP)} R=${f(res.how.meanR)} F1=${f(res.how.meanF1)} (median P=${f(res.how.medP)} R=${f(res.how.medR)} F1=${f(res.how.medF1)}) · grep: P=${f(res.grep.meanP)} R=${f(res.grep.meanR)} F1=${f(res.grep.meanF1)} (median P=${f(res.grep.medP)} R=${f(res.grep.medR)} F1=${f(res.grep.medF1)}) · n=${res.n} · no-match=${res.noMatch}`,
            stamp(),
          ];
        }
        break;
      }
      if (opts.obligation) {
        // §073: leave-one-out coverage/precision of the birth-obligation table, over the repo's own history —
        // the candidate's own commit is never in the table that scores it (obligationEval builds the table
        // chronologically, folding a footprint in only AFTER scoring it — see the function's own comment).
        let H = null;
        if (isGit) {
          try {
            H = (await loadHistory({ gitdir: root, store, log })).H;
          } catch (e) {
            log('history unavailable for selftest --obligation: ' + e.message);
          }
        }
        if (!H || !H.fps || !H.fps.length) {
          const note = `selftest --obligation needs commit history to evaluate against (${!isGit ? 'this is not a git repository' : 'this repository has no readable commit history'})`;
          lines = opts.json
            ? [
                JSON.stringify({
                  note,
                  n: 0,
                  coverage: null,
                  precision1: null,
                  precision3: null,
                  nonObviousN: 0,
                  nonObviousPrecision: null,
                  nullHot: null,
                  nullRandom: null,
                  asOf: stamp().replace(/^as of /, ''),
                }),
              ]
            : [note, stamp()];
          break;
        }
        const res = obligationEval({ model, H, last: +opts.last || 100 });
        if (opts.json) lines = [JSON.stringify({ ...res, asOf: stamp().replace(/^as of /, '') }, null, 1)];
        else {
          const f = x => (x == null ? 'n/a' : x.toFixed(2));
          lines = res.n
            ? [
                `obligation: coverage=${f(res.coverage)} precision@1=${f(res.precision1)} precision@3=${f(res.precision3)} · non-obvious precision=${f(res.nonObviousPrecision)} (n=${res.nonObviousN}) · nulls on the fired subset: hottest=${f(res.nullHot)} random=${f(res.nullRandom)} · n=${res.n}`,
                stamp(),
              ]
            : [`selftest --obligation: no new-file events in the last ${+opts.last || 100} commits to evaluate`, stamp()];
        }
        break;
      }
      const res = await mutateTest({ model, root });
      if (opts.json) lines = [JSON.stringify({ ...res, asOf: stamp().replace(/^as of /, '') }, null, 1)];
      else {
        const plantable = res.detected + res.missed;
        lines = [
          `selftest: ${res.detected}/${plantable} planted deviations caught · ${res.falseFire} false fires · ${res.unsupported} unsupported`,
          stamp(),
        ];
      }
      break;
    }
    default:
      throw new Error(`unknown command "${cmd}"\n${USAGE}`);
  }
  console.log([...banner, ...lines].join('\n'));
  return 0;
}
const USAGE = `grain — ask a repository about its own conventions before writing code.
usage: grain <command> [args] [--repo <path>] [--no-refresh] [--no-history]
  where <intent words> [--top N] [--map-rows N] [--json]  intent → place + expectations + exemplars + co-change
  how <intent words> [--top N] [--json]   intent → the past commits that look like it, and which files such a change touched
  what <words> [--json]                   words → the concept card: declarations, values, spread, siblings, commit mentions, fan-in
  map [--json]                            a structural overview: dependency layers (leaves to top) and how many maintainer decisions are in force
  obligation <path> [--top N] [--json]    what a NEW file under this path (module + extension) has historically come with — <path> need not exist
  check [<file>] [--as <path>] [--content <file>] [--all] [--staged | --range <a>..<b> | --worktree] [--json]
                                          <file>: how its worktree version sits against the local norm; no <file>: one
                                          aggregated report over your whole uncommitted change (default: uncommitted + untracked)
  completeness <file…>                    other files this repo's own commits show reliably changing WITH these — the same line check-hook appends automatically after a matching edit
  explain <file> [--minbits N] [--top N]  the full local→global convention lattice for one file
  status | report [--top N] [--json]      model overview / top conventions, freshness
  rules [--out <file>] [--top N]          a generated Markdown document of established conventions, stamped with the commit — for a
                                          reader with no terminal or no grain plugin; \`grain rules > CONVENTIONS.md\` also works
  export [--out <file>] [--max-sites N] [--compact] [--no-anchors]  the whole model as JSON: every convention with all its sites, anchors, trends,
                                          groups, markers, directories, co-change (for training pipelines and audits)
  propose [<out-dir>] [--full] [--json <path>] [--holdout <YYYY-MM-DD>]   a PROPOSED Yggdrasil \`.yggdrasil/\` architecture graph for this repository —
                                          nodes, relations and mined rules with evidence attached — written to <out-dir> (default
                                          .yggdrasil-proposal/, never over your own .yggdrasil/) for you to read and move in. The report
                                          names the architecture, the rules a real \`yg drill\` proved, and the candidates; \`--full\` adds
                                          every draft it kept back
  decide steer <path>#<name> --surfaces <pid,…> [--instead-of <pid,…>] [--author <who>] --note "…"   promote a value repo-wide (.grain/seeds.jsonl, committed)
  decide boundary <from> --never-imports <to> --note "…"     an architecture decision: new imports crossing it are flagged
  decide waive <path>#<name> --on <pid> --note "…"           excuse ONE scope from ONE convention: check calls its departure deliberate, the counts still report it
  decide list | decide rm <id>            the decisions in force / withdraw one
  selftest [--json]                       plant synthetic deviations into conforming exemplars and report how many this repo's own model catches
  selftest --how [--last N] [--json]      leave-one-out: how's own precision/recall predicting a past commit's files, vs a grep baseline, over the last N commits
  selftest --where [--last N] [--json]    where's own ranking of the file a past commit ADDED, from that commit's message, vs a path-match baseline, over the last N such commits
  selftest --obligation [--last N] [--json]  leave-one-out: the birth-obligation table's own coverage/precision predicting what a past commit that ADDED a file also touched, over the last N such events
  selftest --extract [--json]             per grammar, what fraction of the declarations a node-types.json-derived oracle sees does extraction actually record as a scope
  refresh [--full]                        rebuild the index now (every query already auto-refreshes)
  version                                 engine, extractor and grammar versions
aliases:
  review                                  bare \`check\` (no file argument) — same command, same flags
  completeness <file…>                    the co-change: line of check's missing from your change: block, standalone — works on any file, parsed or not
  seed add | add-boundary | list | rm     \`decide\` under its original name — same command, same records (its own messages still say "seed")
  spectrum <file> [--minbits N] [--top N] \`explain\` under its original name — same command, same output
Index: <repo>/.grain/cache/ (gitignored, disposable). Every answer ends with \`as of <sha>\`; \`check\`/\`review\`/\`explain\`/\`spectrum\` append \`+dirty\` when they read uncommitted content — other commands never claim it, and note a dirty worktree separately instead.`;

// ===== the seams already split out of this file =====
// query surface · argv, repository and store resolution, auto-refresh, the seed file and the worktree/HEAD comparison every command answers from
export { parseArgv, findRoot, storeFor, short, ensureFresh } from './grain-context.mjs';
// query surface · `where` and `how`, and the bounded raw-text hedges they fall back on
export { cmdWhere, cmdHow } from './grain-where.mjs';
// query surface · `what`, `map` and `obligation`
export { cmdWhat, cmdMap, cmdObligation } from './grain-what.mjs';
// query surface · `status`, `report` and `rules`, and the freshness lines they end with
export { cmdStatus, cmdReport, signal } from './grain-report.mjs';
// query surface · the session-context hook and the placement/check feedback loops
export { sessionContext } from './grain-session.mjs';
