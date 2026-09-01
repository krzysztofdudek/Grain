#!/usr/bin/env node
// director skill — decide.mjs
//
// Durable rulings, appended to the committed system log .system/decisions.md.
// Exports `appendDecision` and `parseEntries` so escalate.mjs can record a
// ruling in the exact same format without shelling out.
//
// Entry format (exact):
//   ## <YYYY-MM-DD> · <slug> [· ticket NNN] [· class X]
//   <ruling text, may be multi-line>
//
// The file may carry a preamble and a "Lekcje" (lessons) section — any
// `## ` heading that doesn't match the date-slug pattern is treated as
// non-entry free text and skipped when parsing.

import { join } from 'node:path';
import {
  repoRoot, readText, appendText, today, die, parseArgs, emitResult, isMain,
} from './lib.mjs';

const ROOT = repoRoot();
export const DECISIONS_PATH = join(ROOT, '.system', 'decisions.md');

const ENTRY_RE = /^## (\d{4}-\d{2}-\d{2}) · ([^\s·]+)(?: · ticket (\S+))?(?: · class (\S+))?\s*$/;

const USAGE = `usage: decide.mjs <command> [options]

commands:
  add <slug> "<ruling>" [--ticket NNN] [--class X]
      appends a new entry; refuses a duplicate slug.
  list [--ticket NNN] [--class X] [--grep <re>]
      prints "date slug ticket class first-line" rows.
  show <slug>
      prints the full entry.

options: --json  --help`;

// Parse decisions.md content into { entries }. Each entry is
// { date, slug, ticket, class, body }. Non-matching `## ` headings (and
// everything under them, up to the next heading) are skipped.
export function parseEntries(text) {
  if (!text) return { entries: [] };
  const lines = text.split('\n');
  const entries = [];
  let i = 0;
  while (i < lines.length) {
    const m = ENTRY_RE.exec(lines[i]);
    if (!m) { i++; continue; }
    const [, date, slug, ticket, cls] = m;
    i++;
    const bodyLines = [];
    while (i < lines.length && !lines[i].startsWith('## ')) { bodyLines.push(lines[i]); i++; }
    while (bodyLines.length && bodyLines[0].trim() === '') bodyLines.shift();
    while (bodyLines.length && bodyLines[bodyLines.length - 1].trim() === '') bodyLines.pop();
    entries.push({ date, slug, ticket: ticket || null, class: cls || null, body: bodyLines.join('\n') });
  }
  return { entries };
}

function formatHeading(entry) {
  let h = `## ${entry.date} · ${entry.slug}`;
  if (entry.ticket) h += ` · ticket ${entry.ticket}`;
  if (entry.class) h += ` · class ${entry.class}`;
  return h;
}

// Append a ruling to decisions.md. Throws on missing fields or a duplicate slug.
export function appendDecision(root, { slug, ruling, ticket, class: cls } = {}) {
  if (!slug) throw new Error('slug required');
  if (!ruling) throw new Error('ruling required');
  const path = join(root, '.system', 'decisions.md');
  const existing = readText(path) || '';
  const { entries } = parseEntries(existing);
  if (entries.some((e) => e.slug === slug)) throw new Error(`duplicate slug: ${slug}`);

  const entry = { date: today(), slug, ticket: ticket ? String(ticket) : null, class: cls || null };
  const block = `${formatHeading(entry)}\n${ruling}\n`;
  let sep = '';
  if (existing.length > 0) {
    sep = existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  }
  appendText(path, sep + block);
  return entry;
}

function cmdAdd(positional, flags) {
  const [slug, ruling] = positional;
  if (!slug || !ruling) die('add requires <slug> "<ruling>"');
  let entry;
  try {
    entry = appendDecision(ROOT, { slug, ruling, ticket: flags.ticket, class: flags.class });
  } catch (e) {
    die(e.message);
  }
  emitResult(flags, entry, () => `decision added: ${slug}`);
}

function cmdList(positional, flags) {
  let { entries } = parseEntries(readText(DECISIONS_PATH));
  if (flags.ticket) entries = entries.filter((e) => e.ticket === String(flags.ticket));
  if (flags.class) entries = entries.filter((e) => e.class === flags.class);
  if (flags.grep) {
    const re = new RegExp(flags.grep, 'i');
    entries = entries.filter((e) => re.test(e.slug) || re.test(e.body));
  }
  if (flags.json) { console.log(JSON.stringify(entries, null, 2)); return; }
  if (entries.length === 0) { console.log('(no decisions)'); return; }
  for (const e of entries) {
    const firstLine = (e.body.split('\n')[0] || '').trim();
    console.log([e.date, e.slug, e.ticket || '-', e.class || '-', firstLine].join(' '));
  }
}

function cmdShow(positional, flags) {
  const slug = positional[0];
  if (!slug) die('show requires <slug>');
  const { entries } = parseEntries(readText(DECISIONS_PATH));
  const e = entries.find((x) => x.slug === slug);
  if (!e) die(`no such decision: ${slug}`);
  if (flags.json) { console.log(JSON.stringify(e, null, 2)); return; }
  console.log(`${formatHeading(e)}\n${e.body}`);
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
    default: die(`unknown command: ${cmd} (see --help)`);
  }
}

if (isMain(import.meta.url)) main();
