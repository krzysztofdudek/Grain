// grain engine · query surface · `check` and `review` — one file, and a whole uncommitted change
// Split out of grain.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { GRAMMARS, EXT2GRAMMAR, HARD_EXCL } from './config.mjs';
import {
  checkFile,
  obligationFor,
  cochangeData,
  scopeCochangeLines,
  missingLines,
  valueKinGaps,
  verbalize,
  toPosix,
  scopeLabel,
  groupDeviations,
  placementHit,
  fileLevelPreds,
  pct,
  voice,
  inLineForFile,
} from './core.mjs';
import {  } from './core.mjs';
import { changedRanges, existsMemo, fileDirty, relPath } from './grain-context.mjs';
import { recordCheckFeedback } from './grain-session.mjs';

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
export function reviewFileList(root, opts) {
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
