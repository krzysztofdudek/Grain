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
import { existsSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { ENGINE_VERSION, EXTR_V, HIST_V, MODEL_V, GRAMMARS, EXT2GRAMMAR } from './config.mjs';
import {
  howCmd,
  howEval,
  whereEval,
  obligationFor,
  obligationEval,
  statusLines,
  completenessDirectional,
  cochangeData,
  mutateTest,
  extractCoverage,
  walkFiles,
  verbalize,
  placementHit,
  voice,
  archCellLabel,
  ptr,
  skipLineNote,
} from './core.mjs';
import { loadHistory, headSha, headTree, readHistoryState } from './history.mjs';
import { createHash } from 'node:crypto';
import { partitionFor, DIRTY_TREE_NOTE } from './core.mjs';
import { cmdAdvise } from './grain-advise.mjs';
import { cmdCheck, cmdReview, reviewFileList } from './grain-check.mjs';
import {
  canonicalize,
  ensureFresh,
  existsMemo,
  findRoot,
  log,
  parseArgv,
  readJson,
  relPath,
  repoDirty,
  short,
  storeFor,
} from './grain-context.mjs';
import { cmdExport, cmdPropose } from './grain-export.mjs';
import { cmdReport, cmdRules, cmdStatus, freshnessLines } from './grain-report.mjs';
import { cmdDecide, cmdSpectrum } from './grain-seed.mjs';
import {
  capReviewLines,
  hookCwd,
  recordPlacementPending,
  resolvePlacementPending,
  seenGate,
  sessionContext,
} from './grain-session.mjs';
import { USAGE } from './grain-usage.mjs';
import { cmdMap, cmdObligation, cmdWhat } from './grain-what.mjs';
import { cmdHow, cmdWhere } from './grain-where.mjs';

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
  // `oracle` runs before the index is ever touched, like `version`: it reads two graphs and a file list, not the
  // convention model, and an adopter recording the correction they just made to a proposal should not be made to
  // wait for a rebuild of something the command never reads.
  if (cmd === 'oracle') {
    const { cmdOracle } = await import('./oracle.mjs');
    console.log((await cmdOracle({ root, isGit, args, opts })).join('\n'));
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
    case 'advise':
      lines = await cmdAdvise(ctx);
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

// ===== the seams already split out of this file =====
// query surface · argv, repository and store resolution, auto-refresh, the seed file and the worktree/HEAD comparison every command answers from
export { parseArgv, findRoot, storeFor, short, ensureFresh } from './grain-context.mjs';
// query surface · `where` and `how`, and the bounded raw-text hedges they fall back on
export { cmdWhere, cmdHow } from './grain-where.mjs';
// query surface · `what`, `map` and `obligation`
export { cmdWhat, cmdMap, cmdObligation } from './grain-what.mjs';
// query surface · `check` and `review` — one file, and a whole uncommitted change
export { cmdCheck, cmdReview } from './grain-check.mjs';
// query surface · `status`, `report` and `rules`, and the freshness lines they end with
export { cmdStatus, cmdReport, signal } from './grain-report.mjs';
// query surface · the session-context hook and the placement/check feedback loops
export { sessionContext } from './grain-session.mjs';
