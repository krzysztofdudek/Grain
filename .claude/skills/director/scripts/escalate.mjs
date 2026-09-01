#!/usr/bin/env node
// director skill — escalate.mjs
//
// The lead → director channel (system §6). A lead opens an escalation when
// it hits something it isn't positioned to resolve alone; the director
// rules on it, which both closes the escalation and records a durable
// decision (via decide.mjs's appendDecision — imported, not shelled out).
//
// State: .system/escalations.json (source of truth) + .system/escalations.md (rendered).

import { join } from 'node:path';
import {
  repoRoot, readJSON, writeJSON, writeText, nowIso, die, parseArgs, emitResult, isMain,
} from './lib.mjs';
import { appendDecision } from './decide.mjs';

const ROOT = repoRoot();
const JSON_PATH = join(ROOT, '.system', 'escalations.json');
const MD_PATH = join(ROOT, '.system', 'escalations.md');

const KINDS = ['constant', 'boundary', 'conflict', 'high', 'contradiction', 'claim', 'unverifiable', 'version', 'other'];

const USAGE = `usage: escalate.mjs <command> [options]

commands:
  add "<why>" --kind <${KINDS.join('|')}> [--ticket NNN] [--by lead]
  list [--state open|ruled]
      open first, newest first.
  rule <id> "<ruling>"
      marks the escalation ruled and records the ruling as a decision
      (slug esc-<id>) in .system/decisions.md.
  show <id>

options: --json  --help`;

function load() {
  const doc = readJSON(JSON_PATH, null);
  return doc && Array.isArray(doc.items) ? doc : { items: [] };
}

function save(doc) {
  writeJSON(JSON_PATH, doc);
  writeText(MD_PATH, render(doc));
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    if (a.state !== b.state) return a.state === 'open' ? -1 : 1;
    return (b.at || '').localeCompare(a.at || '');
  });
}

function render(doc) {
  const items = sortItems(doc.items);
  const lines = ['# Escalations', ''];
  if (items.length === 0) lines.push('(none)');
  for (const it of items) {
    const head = [`[${it.id}] ${it.kind}`];
    if (it.ticket) head.push(`ticket ${it.ticket}`);
    head.push(it.state);
    lines.push(`## ${head.join(' · ')}`);
    lines.push(`by: ${it.by} · at: ${it.at}`);
    lines.push(it.why);
    if (it.state === 'ruled') {
      lines.push('');
      lines.push(`ruling (${it.ruledAt}): ${it.ruling}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function nextId(doc) {
  let max = 0;
  for (const it of doc.items) {
    const n = Number(it.id);
    if (Number.isFinite(n)) max = Math.max(max, n);
  }
  return String(max + 1);
}

function cmdAdd(positional, flags) {
  const why = positional[0];
  if (!why) die('add requires "<why>"');
  if (typeof flags.kind !== 'string' || !KINDS.includes(flags.kind)) {
    die(`--kind is required, one of: ${KINDS.join('|')}`);
  }
  const doc = load();
  const id = nextId(doc);
  const item = { id, kind: flags.kind, why, by: flags.by || 'lead', at: nowIso(), state: 'open' };
  if (flags.ticket) item.ticket = String(flags.ticket);
  doc.items.push(item);
  save(doc);
  emitResult(flags, item, () => `escalation ${id} opened (${item.kind})`);
}

function cmdList(positional, flags) {
  const doc = load();
  let items = sortItems(doc.items);
  if (flags.state) items = items.filter((it) => it.state === flags.state);
  if (flags.json) { console.log(JSON.stringify(items, null, 2)); return; }
  if (items.length === 0) { console.log('(no escalations)'); return; }
  for (const it of items) {
    console.log([it.id, it.state, it.kind, it.ticket || '-', it.why.split('\n')[0]].join(' '));
  }
}

function cmdShow(positional, flags) {
  const id = positional[0];
  if (!id) die('show requires <id>');
  const doc = load();
  const it = doc.items.find((x) => x.id === id);
  if (!it) die(`no such escalation: ${id}`);
  if (flags.json) { console.log(JSON.stringify(it, null, 2)); return; }
  const head = [`[${it.id}] ${it.kind}`];
  if (it.ticket) head.push(`ticket ${it.ticket}`);
  head.push(it.state);
  console.log(head.join(' · '));
  console.log(`by ${it.by} at ${it.at}`);
  console.log(it.why);
  if (it.state === 'ruled') console.log(`ruling (${it.ruledAt}): ${it.ruling}`);
}

function cmdRule(positional, flags) {
  const [id, ruling] = positional;
  if (!id || !ruling) die('rule requires <id> "<ruling>"');
  const doc = load();
  const it = doc.items.find((x) => x.id === id);
  if (!it) die(`no such escalation: ${id}`);
  if (it.state === 'ruled') die(`already ruled: ${id}`);
  it.state = 'ruled';
  it.ruling = ruling;
  it.ruledAt = nowIso();
  save(doc);
  try {
    appendDecision(ROOT, { slug: `esc-${id}`, ruling, ticket: it.ticket });
  } catch (e) {
    die(`escalation ${id} marked ruled, but recording the decision failed: ${e.message}`);
  }
  emitResult(flags, it, () => `escalation ${id} ruled — recorded as esc-${id}`);
}

function main() {
  const { positional: allPositional, flags } = parseArgs(process.argv.slice(2));
  const [cmd, ...positional] = allPositional;

  if (flags.help) { console.log(USAGE); process.exit(0); }
  if (!cmd) { die('missing command (see --help)'); }

  switch (cmd) {
    case 'add': return cmdAdd(positional, flags);
    case 'list': return cmdList(positional, flags);
    case 'show': return cmdShow(positional, flags);
    case 'rule': return cmdRule(positional, flags);
    default: die(`unknown command: ${cmd} (see --help)`);
  }
}

if (isMain(import.meta.url)) main();
