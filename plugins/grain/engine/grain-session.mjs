// grain engine · query surface · the session-context hook and the placement/check feedback loops
// Split out of grain.mjs (ticket 124): the statements below are the ones that stood there, unchanged.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { dirname as posixDirname } from 'node:path/posix';
import { sufOf, nameTokens, voice } from './core.mjs';
import { headSha } from './history.mjs';
import { createHash } from 'node:crypto';
import {  } from './core.mjs';
import { BIN, readJson, short } from './grain-context.mjs';
import { signal } from './grain-report.mjs';
import { resolveYg } from './propose-base.mjs';

// ----- session-context: what the SessionStart hook injects (no refresh, no parsing — must be instant) -----
export function sessionContext({ root, isGit, store, mode }) {
  const meta = readJson(store.metaPath);
  const model = meta && existsSync(store.modelPath) ? readJson(store.modelPath) : null;
  const head = isGit ? headSha(root) : null;
  let state, sig = null;
  if (!isGit && !model)
    state = 'not built yet — the first query builds it (no git here, so weights will be flat)';
  else if (!model)
    state = `not built yet — the first query walks the full git history and parses every file; on a multi-thousand-commit or densely-scoped repo this can run minutes, not seconds, and a tight command timeout may mistake that for a hang; run \`grain refresh\` ahead of time, or add \`--no-history\` for a fast first answer without the history layer (later refreshes are incremental)`;
  else {
    sig = signal(model);
    state = `${meta.headSha === head ? 'ready' : 'built at ' + short(meta.headSha) + ', HEAD moved to ' + short(head) + ' — the first query refreshes it incrementally'}: ${model.files} files, ${sig.groups} groups, ${sig.facts} conventions in source code (${sig.verdict})`;
  }
  // §067a: the advertised commands below lead with the conceptual name `grain`, never with `node` — a real
  // transcript (question-catalog §4.1a) had an agent see `pnpm` denied, generalize that to "node invocations all
  // require approval", and never attempt grain at all, even though nothing had shown grain itself would be
  // blocked. `bin` (the literal `node "<path>"` form the plugin actually shells out to — see hooks.json/hooks/*,
  // there is no installed `grain` shim on PATH; the package.json `bin` field only applies to an `npm install -g`
  // this plugin's distribution mechanism never performs) is still shown, once per command, but as the answer to
  // "how do I run this", not as the first word the agent reads.
  //
  // §088: `obligation`/`completeness` are folded into the `where`/`check` lines as trigger-moment asides, NOT
  // given their own top-level bullets — ticket 081 measured this exact roster (61 of 63 agent calls went to a
  // command named in the pre-em-dash "roster" segment of these lines) and separately measured that the reachable
  // slot budget must stay short (question-catalog: agents read only the first few lines). Naming them at the SAME
  // moment `where`/`check` already own — "before creating a file" for `obligation`, "before you consider the
  // change done" for `completeness` — spends no new slot and adds no new line, so the concepts-and-changes-map.js
  // <=9-line budget (§J4.3b) and the §081 roster test are both unaffected by construction, not by exemption.
  const bin = `node "${BIN}"`;
  const text = [
    `grain is available here: a convention oracle mined from this repo's code and git history. It names WHICH directory, group, marker or file to open and the exemplar to copy, with evidence. Run the grain command below from the repo root via Bash; every answer ends with \`as of <sha>\`. grain is its own tool, invoked via node — a denial of some unrelated command (pnpm, npm, a bare node script, …) earlier in this session says nothing about whether grain itself is blocked; it has not been tried yet.`,
    `  grain where <intent words>   — before creating a source file or when unsure where something belongs; use the repo's own words (a decorator, a base type, a file or function name). One call per intent; a compact map = no hit: open the closest entry, do not re-ask with synonyms. Run: \`${bin} where <intent words>\`. Same moment, what must come with it: \`grain obligation <path>\` (same invocation form).`,
    `  grain check <file>           — after you wrote or edited a file: deviations IN YOUR CHANGE (evidence + exemplars); pre-existing ones folded. Zero deviations is not a review.${mode === 'claude' || mode === 'codex' ? ' Runs automatically after every edit in this session — a [grain] note after an edit is this; silence means nothing certified to say, NOT approval.' : ''} Run: \`${bin} check <file>\`. Before you consider the change done: \`grain completeness <file>\` for co-changing files you may have missed.`,
    `  grain status | report        — size, freshness, top conventions. Run: \`${bin} status\` or \`${bin} report\`.`,
    `Index: ${state}.`,
    // Grain 2 (mission triage): `sig` is already computed above the moment a model exists — this hook has
    // held the verdict since before the SessionStart hook existed, and never printed it. A sparse model is the
    // one verdict worth a line of its own here: it says an agent's `where`/`check` answers this session will
    // read as placement, not shape, before the agent hits that surprise mid-task. The other verdicts (rich,
    // moderate, empty, no source partition) are read straight off `Index:` above and cost nothing extra.
    ...(sig && /^a sparse model\b/.test(sig.verdict) ? [sig.verdict] : []),
    ...(model && model.moduleGraph && model.moduleGraph.edges.length
      ? [
          (() => {
            const mg = model.moduleGraph;
            const sinks = new Map();
            for (const e of mg.edges) sinks.set(e.to, (sinks.get(e.to) || 0) + e.n);
            const core = [...sinks]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 2)
              .map(([m]) => m + '/')
              .join(', ');
            const layers = new Set(mg.nodes.map(n => n.layer)).size;
            return `Architecture (measured): ${mg.nodes.length} modules, ${mg.edges.length} dependencies, ${mg.cycles.length} cycle(s), ${layers} layer(s); most depended-on: ${core}. \`grain report\` prints the graph.`;
          })(),
        ]
      : []),
    // §081/104: ONE conditional line, and only where the trigger moment is real — this repository has a grain
    // index (so there is something to propose from) and no `.yggdrasil/` of its own (so nothing would be
    // overwritten and the graph is genuinely missing). A repo that already has a graph sees this text at
    // exactly the byte count it saw before the command existed. The reachability law (research/command-
    // reachability.md: 0 of 63 agent calls went to a command named in neither the SessionStart text nor the
    // SKILL description) is why the line exists at all; the condition is why it costs the other repos nothing.
    ...(model && !existsSync(join(root, '.yggdrasil'))
      ? [
          `This repository has no architecture graph yet (no .yggdrasil/). When the task is to adopt Yggdrasil here, or to write down the architecture this repo already practises, \`grain propose\` mines one — nodes, relations and rules with the evidence attached — into .yggdrasil-proposal/ for a human to review and move in. Run: \`${bin} propose\`.`,
        ]
      : []),
    // Ticket 028 ("Grain jako wejście do rodziny", D8/D10): the mirror image of the block above — a
    // repository that ALREADY has `.yggdrasil/` gets pointed at the law itself, not at mining a new one.
    // `existsSync` alone (no `statSync` distinction, matching the no-graph branch above) is deliberate: a
    // `.yggdrasil` that is a FILE, not a directory, is still "present" for this sentence's purposes, and the
    // sentence names no path grain would need to read. `resolveYg` only runs (a `which`/`where` spawn) once
    // `.yggdrasil/` is confirmed present, so a repo with no graph — most of them — pays nothing for this line
    // ever being checked, the same cost discipline the sibling block above documents for itself.
    ...(model && existsSync(join(root, '.yggdrasil'))
      ? [
          'This repository runs Yggdrasil; read `yg prime` before changing code, and ask grain where a change belongs.',
          ...(resolveYg().have
            ? []
            : [
                'Yggdrasil\'s CLI is not on PATH — `yg prime` and `yg check` cannot run. Install it with `npm i -g @chrisdudek/yg` (or set YG_BIN to a built bin.js).',
              ]),
        ]
      : []),
    ...(model && model.concepts && model.concepts.length
      ? [voice('map', `concepts: ${model.concepts.join(', ')}`)]
      : []),
    ...(model && model.changeArchetypes && model.changeArchetypes.length
      ? [
          (() => {
            const cs = model.changeArchetypes;
            const segs = cs.slice(0, 4).map(a => `"${a.label}" — ${a.n} change${a.n === 1 ? '' : 's'}`);
            return voice(
              'practiced',
              `changes: ${segs.join(' · ')}${cs.length > 4 ? ` · +${cs.length - 4} more` : ''}`
            );
          })(),
        ]
      : []),
    ...(model && model.steers && model.steers.filter(st => st.found).length
      ? [
          (() => {
            const act = model.steers.filter(st => st.found);
            return `Maintainer decisions in force (committed .grain/seeds.jsonl — follow them even where the numbers lag; \`grain seed list\`): ${act
              .slice(0, 3)
              .map(st => st.note || st.topic || st.id)
              .join(' · ')}${act.length > 3 ? ` · +${act.length - 3} more` : ''}`;
          })(),
        ]
      : []),
  ].join('\n');
  if (mode === 'copilot') return { additionalContext: text };
  if (mode === 'cursor') return { additional_context: text };
  return { hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } };
}
// hooks receive a JSON payload on stdin ({ cwd, session_id, … }); read it only when stdin is a pipe with data
export function hookCwd() {
  try {
    if (process.stdin.isTTY) return null;
    const raw = readFileSync(0, 'utf8');
    if (!raw.trim()) return null;
    const j = JSON.parse(raw);
    return typeof j.cwd === 'string' ? j.cwd : null;
  } catch {
    return null;
  }
}
// ----- placement feedback loop: a purely local, never-transmitted signal for whether a PreToolUse placement
// suggestion (placementHit, core.mjs) was actually followed. Two small state files in the same store dir as
// hook-seen.json: placement-pending.json (a suggestion awaiting its outcome) and placement-outcomes.json (a
// cumulative { followed, deviated } tally — latest state, not a history, exactly like hook-seen.json keeps
// only the latest signature per file rather than every past one).
//
// Correlation is by SUFFIX + NAME-KIN TOKEN (`sufOf`/`nameTokens`, core.mjs — the same keys placementHit itself
// groups candidates by), never by the exact `rel` grain was asked about. A single Write's PreToolUse and
// PostToolUse always see the IDENTICAL path, and placementHit only ever fires when that path's CURRENT
// directory does NOT already hold the name-kin — so resolving against that same `rel` can mathematically never
// observe "followed" (dirname(rel) was already established as wrong the moment Pre looked at it). The real
// "followed" case is a SEPARATE, corrective write at a DIFFERENT path — whose own PreToolUse finds no hit at
// all, since the destination is already correct. Keying by suffix+token lets that second, differently-pathed
// write still find the first write's pending suggestion.
//
// The pending window reuses GRAIN_HOOK_TTL_MS rather than a second constant: a placement suggestion is only
// actionable while the agent is still working that same name-kin file, which is the same timescale the hook's
// own repeat-suppression already models — a separate "how long is a suggestion live" number would track the
// same thing under a different name.
function pendingKey(suf, token) {
  return suf + '#' + (token || '');
}
function prunePending(pending, now, ttl) {
  for (const k of Object.keys(pending)) if (now - pending[k].t >= ttl) delete pending[k];
}
// hook-seen.json is shared by every unbidden hook (check/how/read/commit/edit, …) — each MUST namespace its own
// key (`'check:' + rel`, `'how:' + hash`, …) or two hooks silently overwrite/read each other's suppression state.
// One shared gate, reusing `prunePending`'s own pruning rather than a second copy of it: prune every stale entry
// (any namespace) first, then speak only if this key's content actually changed (or is new) since last time.
export function seenGate(store, key, sigText) {
  try {
    const now = Date.now();
    const ttl = +(process.env.GRAIN_HOOK_TTL_MS || 15 * 60 * 1000);
    const p = join(store.dir, 'hook-seen.json');
    const seen = readJson(p) || {};
    prunePending(seen, now, ttl); // an entry surviving this is, by construction, still within its TTL
    const h = createHash('sha256').update(sigText).digest('hex').slice(0, 16);
    const speak = !seen[key] || seen[key].h !== h;
    seen[key] = { h, t: now };
    writeFileSync(p, JSON.stringify(seen));
    return speak;
  } catch {
    return true; /* stateless is still correct, just louder */
  }
}
export function recordPlacementPending(st2, ph, rel) {
  try {
    const now = Date.now();
    const ttl = +(process.env.GRAIN_HOOK_TTL_MS || 15 * 60 * 1000);
    const p = join(st2.dir, 'placement-pending.json');
    const pending = readJson(p) || {};
    prunePending(pending, now, ttl);
    pending[pendingKey(ph.suf, ph.token)] = { dir: ph.dir, t: now, badRel: rel };
    writeFileSync(p, JSON.stringify(pending));
  } catch {
    /* stateless is still correct, just louder */
  }
}
export function resolvePlacementPending(st2, root, rel) {
  try {
    if (!existsSync(join(root, rel))) return; // only a confirmed write can resolve anything
    const now = Date.now();
    const ttl = +(process.env.GRAIN_HOOK_TTL_MS || 15 * 60 * 1000);
    const p = join(st2.dir, 'placement-pending.json');
    const pending = readJson(p) || {};
    prunePending(pending, now, ttl);
    const suf2 = sufOf(rel);
    const dir2 = posixDirname(rel);
    const keys = [pendingKey(suf2, null), ...nameTokens(rel).map(t => pendingKey(suf2, t))];
    for (const k of keys) {
      const entry = pending[k];
      if (!entry) continue;
      if (rel === entry.badRel) {
        bumpOutcome(st2, 'deviated');
        delete pending[k];
      } else if (dir2 === entry.dir) {
        bumpOutcome(st2, 'followed');
        delete pending[k];
      }
      // else: a second miss on the same suffix/token — leave it pending, don't guess, don't double-count
    }
    writeFileSync(p, JSON.stringify(pending));
  } catch {
    /* stateless is still correct, just louder */
  }
}
function bumpOutcome(st2, kind) {
  const op = join(st2.dir, 'placement-outcomes.json');
  const outcomes = readJson(op) || { followed: 0, deviated: 0 };
  outcomes[kind]++;
  writeFileSync(op, JSON.stringify(outcomes));
}
// ----- check feedback loop: did a maintainer act on a deviation `check`/`review` flagged, or keep ignoring it? Same
// shape as the placement feedback loop above — a pending record (.grain/cache/check-pending.json) written the first
// time a deviation is seen IN THE CALLER'S CHANGE, resolved on a later check of the same file: gone entirely →
// acted; still present but the file's content changed since (an edit happened and did not fix it) → ignored; content
// unchanged → left pending, not yet a verdict either way. Reuses GRAIN_HOOK_TTL_MS and prunePending for the same
// reason the placement loop does: a flagged deviation is only actionable while the file is still being worked, the
// same timescale the hook's own repeat-suppression already models.
//
// Keyed `rel + '#' + factKey` (factKey is already `cid + '|' + pid` — no need to fold pid in twice). The cumulative
// `byFact` counter is keyed `partition + '::' + pid`, NOT `factKey`/`cid`: a `cid` like `r3:method` carries a role
// INDEX that shuffles on every re-learn, and `.grain/cache/` is not cleared on a version bump, so a counter keyed on
// it would silently survive a re-learn and point at the wrong convention afterward.
function checkPendingKey(rel, factKey) {
  return rel + '#' + factKey;
}
export function recordCheckFeedback(store, rel, partition, inChange, text) {
  try {
    const now = Date.now();
    const ttl = +(process.env.GRAIN_HOOK_TTL_MS || 15 * 60 * 1000);
    const p = join(store.dir, 'check-pending.json');
    const pending = readJson(p) || {};
    prunePending(pending, now, ttl);
    const h = createHash('sha256').update(text).digest('hex').slice(0, 16);
    const prefix = rel + '#';
    let acted = 0,
      ignored = 0;
    const ignoredFacts = [];
    for (const k of Object.keys(pending)) {
      if (!k.startsWith(prefix)) continue; // only entries belonging to the file being checked now
      const g = inChange.find(x => checkPendingKey(rel, x.factKey) === k);
      if (!g) {
        acted++;
        delete pending[k];
        continue;
      } // the deviation is gone — no group with this (rel, factKey) remains
      if (pending[k].h !== h) {
        ignored++;
        ignoredFacts.push(partition + '::' + g.pid);
        delete pending[k];
      }
      // else: same deviation, unchanged content — hasn't had a chance to act yet, leave it pending untouched
    }
    for (const g of inChange) {
      const k = checkPendingKey(rel, g.factKey);
      if (!pending[k]) pending[k] = { t: now, obs: g.obs, h };
    }
    writeFileSync(p, JSON.stringify(pending));
    if (acted || ignored) {
      const op = join(store.dir, 'check-outcomes.json');
      const outcomes = readJson(op) || { acted: 0, ignored: 0, byFact: {} };
      outcomes.acted += acted;
      outcomes.ignored += ignored;
      for (const fk of ignoredFacts) outcomes.byFact[fk] = (outcomes.byFact[fk] || 0) + 1;
      writeFileSync(op, JSON.stringify(outcomes));
    }
  } catch {
    /* stateless is still correct, just louder */
  }
}
// §J6.3's own budget split: `cmdReview`'s flat line array is [header, (`== <rel> — n finding(s) ==` + its finding
// lines)*, ('missing from your change:' + its lines)?, stamp] — a flat `.slice(0,8)` over the whole thing would
// delete the `missing from your change:` block entirely since it is appended LAST. Cap per-file sections and the
// missing block on separate budgets instead, each with check-hook's own "+N more" idiom (grain.mjs, check-hook).
export function capReviewLines(lines, sectionCap, missingCap) {
  const stampLine = lines[lines.length - 1];
  const missingIdx = lines.indexOf('missing from your change:');
  const bodyEnd = missingIdx === -1 ? lines.length - 1 : missingIdx;
  const sections = [];
  for (const l of lines.slice(1, bodyEnd)) {
    if (/^== .+ — \d+ finding\(s\) ==$/.test(l)) sections.push([l]);
    else if (sections.length) sections[sections.length - 1].push(l);
  }
  const missing = missingIdx === -1 ? [] : lines.slice(missingIdx + 1, lines.length - 1);
  const out = [lines[0]];
  for (const s of sections.slice(0, sectionCap)) out.push(...s);
  if (sections.length > sectionCap)
    out.push(`  (+${sections.length - sectionCap} more file(s) — run \`grain review\`)`);
  if (missing.length) {
    out.push('missing from your change:');
    out.push(...missing.slice(0, missingCap));
    if (missing.length > missingCap)
      out.push(`  (+${missing.length - missingCap} more — run \`grain review\`)`);
  }
  out.push(stampLine);
  return out;
}
