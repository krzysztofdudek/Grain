#!/usr/bin/env node
// director skill — wave.mjs
//
// The wave log: an append-only journal in .system/plan.md. Never rewrites
// existing content — every command only appends. If plan.md pre-exists
// with content, this appends after it.

import { join } from 'node:path';
import {
  repoRoot, readText, appendText, today, die, parseArgs, emitResult, isMain,
} from './lib.mjs';

const ROOT = repoRoot();
const PLAN_PATH = join(ROOT, '.system', 'plan.md');

const START_RE = /^# Fala (.+) — start \d{4}-\d{2}-\d{2}$/;
const CLOSE_RE = /^# Fala (.+) — close \d{4}-\d{2}-\d{2}$/;

const USAGE = `usage: wave.mjs <command> [options]

commands:
  start <name> [--note "<n>"]
      appends "# Fala <name> — start <date>".
  note "<text>"
      appends a dated bullet under the current wave.
  merged <ticket-or-name> <sha>
      appends a dated "merged: ..." bullet.
  close [--versions "<v>"] [--suite N] [--note "<n>"]
      appends a close block for the current wave.
  current
      prints the current (last-started, not closed) wave name, or "none".
  audit <ticket> <verdict> "<what>"
      appends a dated "audit: ticket verdict — what" bullet.

options: --json  --help`;

function currentWaveName() {
  const text = readText(PLAN_PATH);
  if (!text) return null;
  let current = null;
  for (const line of text.split('\n')) {
    const sm = START_RE.exec(line);
    if (sm) { current = sm[1]; continue; }
    const cm = CLOSE_RE.exec(line);
    if (cm && cm[1] === current) current = null;
  }
  return current;
}

function append(text) {
  const existing = readText(PLAN_PATH) || '';
  const sep = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  appendText(PLAN_PATH, sep + text);
}

function cmdStart(positional, flags) {
  const name = positional[0];
  if (!name) die('start requires <name>');
  append(`\n# Fala ${name} — start ${today()}\n`);
  if (flags.note) append(`- ${today()} ${flags.note}\n`);
  emitResult(flags, { name }, () => `wave started: ${name}`);
}

function cmdNote(positional, flags) {
  const text = positional[0];
  if (!text) die('note requires "<text>"');
  append(`- ${today()} ${text}\n`);
  emitResult(flags, { note: text }, () => 'note added');
}

function cmdMerged(positional, flags) {
  const [ticketOrName, sha] = positional;
  if (!ticketOrName || !sha) die('merged requires <ticket-or-name> <sha>');
  append(`- ${today()} merged: ${ticketOrName} ${sha}\n`);
  emitResult(flags, { ticketOrName, sha }, () => `merged noted: ${ticketOrName} ${sha}`);
}

function cmdClose(positional, flags) {
  const name = currentWaveName();
  if (!name) die('no open wave to close');
  const lines = [`\n# Fala ${name} — close ${today()}`];
  if (flags.versions) lines.push(`versions: ${flags.versions}`);
  if (flags.suite) lines.push(`suite: ${flags.suite}`);
  if (flags.note) lines.push(`note: ${flags.note}`);
  append(`${lines.join('\n')}\n`);
  emitResult(
    flags,
    { name, versions: flags.versions || null, suite: flags.suite || null, note: flags.note || null },
    () => `wave closed: ${name}`,
  );
}

function cmdCurrent(positional, flags) {
  const name = currentWaveName();
  emitResult(flags, { current: name || null }, () => name || 'none');
}

function cmdAudit(positional, flags) {
  const [ticket, verdict, what] = positional;
  if (!ticket || !verdict || !what) die('audit requires <ticket> <verdict> "<what>"');
  append(`- ${today()} audit: ${ticket} ${verdict} — ${what}\n`);
  emitResult(flags, { ticket, verdict, what }, () => `audit noted: ${ticket} ${verdict}`);
}

function main() {
  const { positional: allPositional, flags } = parseArgs(process.argv.slice(2));
  const [cmd, ...positional] = allPositional;

  if (flags.help) { console.log(USAGE); process.exit(0); }
  if (!cmd) { die('missing command (see --help)'); }

  switch (cmd) {
    case 'start': return cmdStart(positional, flags);
    case 'note': return cmdNote(positional, flags);
    case 'merged': return cmdMerged(positional, flags);
    case 'close': return cmdClose(positional, flags);
    case 'current': return cmdCurrent(positional, flags);
    case 'audit': return cmdAudit(positional, flags);
    default: die(`unknown command: ${cmd} (see --help)`);
  }
}

if (isMain(import.meta.url)) main();
