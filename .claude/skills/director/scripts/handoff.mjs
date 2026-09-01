#!/usr/bin/env node
// director skill — handoff.mjs
//
// Tracks the state of INTENT between director/lead sessions: what's in
// flight, what's blocked on a decision, who's waiting on whom, and what
// happened / should happen next. The mechanical state (queue items, ticket
// files) lives elsewhere (queue.mjs, tk.mjs); this is the narrative layer
// a new session reads first.
//
// State: .system/handoff.json (source of truth) + .system/handoff.md (rendered).

import { join } from 'node:path';
import { existsSync } from 'node:fs';
import {
  repoRoot, readJSON, writeJSON, readText, writeText, nowIso, today,
  gitHead, die, parseArgs, asArray, emitResult, isMain,
} from './lib.mjs';

const ROOT = repoRoot();
const JSON_PATH = join(ROOT, '.system', 'handoff.json');
const MD_PATH = join(ROOT, '.system', 'handoff.md');
const QUEUE_PATH = join(ROOT, '.system', 'queue.json');
const PLAN_PATH = join(ROOT, '.system', 'plan.md');

const USAGE = `usage: handoff.mjs <command> [options]

commands:
  write --summary "<s>" [--next "<a>"]... [--note "<n>"]... [--by director|lead]
      writes a fresh handoff: head from git, inFlight from queue.json
      (state "running" items), lastActions from the last 10 lines of
      plan.md. pendingDecisions and waitingOn carry forward unchanged.
  read
      prints the rendered handoff.md, or "no handoff — fresh start" if
      none exists yet.
  add-inflight <name> --task "<t>" [--agent-id x] [--branch b] [--reports-to lead|director]
  rm-inflight <name>
  add-decision "<question>" [--context "<c>"] [--blocks <branch>]
  resolve-decision <id>
  add-waiting <who> "<what>"
  rm-waiting <who>

options: --json  --help`;

function emptyDoc() {
  return {
    at: null, by: null, head: null, summary: '',
    inFlight: [], pendingDecisions: [], waitingOn: [],
    lastActions: [], nextActions: [], notes: [],
  };
}

function load() {
  const doc = readJSON(JSON_PATH, null);
  return doc ? { ...emptyDoc(), ...doc } : emptyDoc();
}

function touch(doc) {
  doc.at = nowIso();
  if (!doc.by) doc.by = 'director';
  if (!doc.head) doc.head = gitHead(ROOT);
  return doc;
}

function save(doc) {
  writeJSON(JSON_PATH, doc);
  writeText(MD_PATH, render(doc));
}

function render(doc) {
  const lines = [];
  lines.push('# Handoff', '');
  lines.push(`at: ${doc.at || '-'}`);
  lines.push(`by: ${doc.by || '-'}`);
  lines.push(`head: ${doc.head || '-'}`, '');
  lines.push('## Summary', doc.summary || '(none)', '');

  lines.push('## In flight');
  if (doc.inFlight.length === 0) lines.push('(none)');
  for (const f of doc.inFlight) {
    const bits = [f.name];
    if (f.agentId) bits.push(`agent:${f.agentId}`);
    if (f.branch) bits.push(`branch:${f.branch}`);
    lines.push(`- ${bits.join(' ')} — ${f.task || ''} (since ${f.since}, reports to ${f.reportsTo || '-'})`);
  }
  lines.push('');

  lines.push('## Pending decisions');
  if (doc.pendingDecisions.length === 0) lines.push('(none)');
  for (const d of doc.pendingDecisions) {
    let l = `- [${d.id}] ${d.question}`;
    if (d.context) l += ` — ${d.context}`;
    if (d.blockedBranch) l += ` (blocks ${d.blockedBranch})`;
    lines.push(l);
  }
  lines.push('');

  lines.push('## Waiting on');
  if (doc.waitingOn.length === 0) lines.push('(none)');
  for (const w of doc.waitingOn) lines.push(`- ${w.who}: ${w.what} (since ${w.since})`);
  lines.push('');

  lines.push('## Last actions');
  if (doc.lastActions.length === 0) lines.push('(none)');
  for (const a of doc.lastActions) lines.push(`- ${a}`);
  lines.push('');

  lines.push('## Next actions');
  if (doc.nextActions.length === 0) lines.push('(none)');
  for (const a of doc.nextActions) lines.push(`- ${a}`);
  lines.push('');

  lines.push('## Notes');
  if (doc.notes.length === 0) lines.push('(none)');
  for (const n of doc.notes) lines.push(`- ${n}`);
  lines.push('');

  return lines.join('\n');
}

function deriveInFlight() {
  const q = readJSON(QUEUE_PATH, null);
  if (!q) return [];
  const items = Array.isArray(q) ? q : Array.isArray(q.items) ? q.items : [];
  return items
    .filter((it) => it && it.state === 'running')
    .map((it) => {
      const entry = {
        name: it.name || it.id || it.ticket || 'unknown',
        task: it.task || it.description || it.title || '',
        since: it.since || it.startedAt || it.claimedAt || nowIso(),
        reportsTo: it.reportsTo || 'lead',
      };
      if (it.agentId) entry.agentId = it.agentId;
      if (it.branch) entry.branch = it.branch;
      return entry;
    });
}

function deriveLastActions() {
  const text = readText(PLAN_PATH);
  if (!text) return [];
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.slice(-10);
}

function cmdWrite(positional, flags) {
  if (typeof flags.summary !== 'string' || flags.summary.length === 0) {
    die('write requires --summary "<s>"');
  }
  const by = typeof flags.by === 'string' ? flags.by : 'director';
  if (by !== 'director' && by !== 'lead') die('--by must be "director" or "lead"');

  const doc = load();
  doc.at = nowIso();
  doc.by = by;
  doc.head = gitHead(ROOT);
  doc.summary = flags.summary;
  doc.inFlight = deriveInFlight();
  doc.lastActions = deriveLastActions();
  doc.nextActions = asArray(flags.next);
  doc.notes = asArray(flags.note);
  save(doc);
  emitResult(flags, doc, () => `handoff written · head ${doc.head} · ${doc.inFlight.length} in flight`);
}

function cmdRead(flags) {
  if (!existsSync(JSON_PATH)) {
    if (flags.json) { console.log(JSON.stringify(null)); return; }
    console.log('no handoff — fresh start');
    return;
  }
  const doc = load();
  if (flags.json) { console.log(JSON.stringify(doc, null, 2)); return; }
  console.log(readText(MD_PATH) || render(doc));
}

function cmdAddInflight(positional, flags) {
  const name = positional[0];
  if (!name) die('add-inflight requires <name>');
  if (typeof flags.task !== 'string' || flags.task.length === 0) die('add-inflight requires --task "<t>"');
  const doc = touch(load());
  const entry = { name, task: flags.task, since: nowIso(), reportsTo: flags['reports-to'] || 'lead' };
  if (flags['agent-id']) entry.agentId = flags['agent-id'];
  if (flags.branch) entry.branch = flags.branch;
  const idx = doc.inFlight.findIndex((f) => f.name === name);
  if (idx >= 0) doc.inFlight[idx] = entry; else doc.inFlight.push(entry);
  save(doc);
  emitResult(flags, entry, () => `in flight: ${name}`);
}

function cmdRmInflight(positional, flags) {
  const name = positional[0];
  if (!name) die('rm-inflight requires <name>');
  const doc = touch(load());
  const before = doc.inFlight.length;
  doc.inFlight = doc.inFlight.filter((f) => f.name !== name);
  const removed = before !== doc.inFlight.length;
  save(doc);
  emitResult(flags, { removed }, () => (removed ? `removed: ${name}` : `not found: ${name}`));
}

function nextDecisionId(doc) {
  let max = 0;
  for (const d of doc.pendingDecisions) {
    const m = /^d(\d+)$/.exec(d.id || '');
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `d${max + 1}`;
}

function cmdAddDecision(positional, flags) {
  const question = positional[0];
  if (!question) die('add-decision requires "<question>"');
  const doc = touch(load());
  const id = nextDecisionId(doc);
  const entry = { id, question };
  if (flags.context) entry.context = flags.context;
  if (flags.blocks) entry.blockedBranch = flags.blocks;
  doc.pendingDecisions.push(entry);
  save(doc);
  emitResult(flags, entry, () => `pending decision ${id}: ${question}`);
}

function cmdResolveDecision(positional, flags) {
  const id = positional[0];
  if (!id) die('resolve-decision requires <id>');
  const doc = touch(load());
  const before = doc.pendingDecisions.length;
  doc.pendingDecisions = doc.pendingDecisions.filter((d) => d.id !== id);
  if (before === doc.pendingDecisions.length) die(`no such pending decision: ${id}`);
  save(doc);
  emitResult(flags, { resolved: id }, () => `resolved: ${id}`);
}

function cmdAddWaiting(positional, flags) {
  const [who, what] = positional;
  if (!who || !what) die('add-waiting requires <who> "<what>"');
  const doc = touch(load());
  doc.waitingOn.push({ who, what, since: nowIso() });
  save(doc);
  emitResult(flags, { who, what }, () => `waiting on ${who}: ${what}`);
}

function cmdRmWaiting(positional, flags) {
  const who = positional[0];
  if (!who) die('rm-waiting requires <who>');
  const doc = touch(load());
  const before = doc.waitingOn.length;
  doc.waitingOn = doc.waitingOn.filter((w) => w.who !== who);
  const removed = before - doc.waitingOn.length;
  save(doc);
  emitResult(flags, { removed }, () => `removed ${removed} waiting-on entr${removed === 1 ? 'y' : 'ies'} for ${who}`);
}

function main() {
  const { positional: allPositional, flags } = parseArgs(process.argv.slice(2));
  const [cmd, ...positional] = allPositional;

  if (flags.help) { console.log(USAGE); process.exit(0); }
  if (!cmd) { die('missing command (see --help)'); }

  switch (cmd) {
    case 'write': return cmdWrite(positional, flags);
    case 'read': return cmdRead(flags);
    case 'add-inflight': return cmdAddInflight(positional, flags);
    case 'rm-inflight': return cmdRmInflight(positional, flags);
    case 'add-decision': return cmdAddDecision(positional, flags);
    case 'resolve-decision': return cmdResolveDecision(positional, flags);
    case 'add-waiting': return cmdAddWaiting(positional, flags);
    case 'rm-waiting': return cmdRmWaiting(positional, flags);
    default: die(`unknown command: ${cmd} (see --help)`);
  }
}

if (isMain(import.meta.url)) main();
