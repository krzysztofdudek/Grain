#!/usr/bin/env node
// tk — ticket tracker over .system/issues/NNN-slug/{issue.md,log.md}.
// Zero dependencies. Run from the repo root:
//   node .claude/skills/director/scripts/tk.mjs <command> [args] [--json] [--root <path>]
import { existsSync, readFileSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  findRepoRoot, issuesDir, pad3, todayDate, nowStamp, fail, parseArgs, printTable,
} from './_lib.mjs';

const HELP = `tk — ticket tracker over .system/issues/

Usage:
  tk list [--state s[,s]] [--severity x] [--class X] [--open] [--json]
  tk show NNN [--log] [--json]
  tk new <slug> --title "<t>" [--severity high|medium|low] [--class X] [--found-by "<who>"] [--json]
  tk status NNN <state> ["<note>"] [--json]
  tk log NNN "<text>" [--json]
  tk ledger [--json]
  tk next [--json]
  tk grep <regex> [-i] [--json]
  tk --help

States (tk status / tk list --state): open diagnosed measured approved queued fixed resolved landed wontfix
Global flags: --json    machine-readable output
              --root    override the auto-detected repo root (default: walk up to .git)
`;

// --- issue.md parsing --------------------------------------------------

const STATE_MAP = {
  FIXED: 'fixed', DONE: 'fixed',
  RESOLVED: 'resolved',
  OPEN: 'open',
  DIAGNOSED: 'diagnosed', ROOT: 'diagnosed',
  MEASURED: 'measured',
  APPROVED: 'approved',
  QUEUED: 'queued',
  LANDED: 'landed',
  WONTFIX: 'wontfix',
};
export const ALLOWED_STATES = ['open', 'diagnosed', 'measured', 'approved', 'queued', 'fixed', 'resolved', 'landed', 'wontfix'];
const CLOSED_STATES = new Set(['fixed', 'resolved', 'wontfix']);

function firstToken(raw) {
  if (!raw) return '';
  const tok = raw.trim().split(/\s+/)[0] || '';
  return tok.replace(/[^A-Za-z]+$/, '');
}

export function normalizeState(raw) {
  const tok = firstToken(raw).toUpperCase();
  return STATE_MAP[tok] || 'unknown';
}

export function normalizeSeverity(raw) {
  const tok = firstToken(raw).toLowerCase();
  return ['high', 'medium', 'low'].includes(tok) ? tok : 'unknown';
}

function parseTitle(line) {
  if (!line) return '';
  const m = /^#\s*\S+\s*·\s*(.*)$/.exec(line.trim());
  if (m) return m[1].trim();
  const m2 = /^#\s*(.*)$/.exec(line.trim());
  return m2 ? m2[1].trim() : '';
}

export function parseIssueText(text) {
  const lines = text.split(/\r?\n/);
  const title = parseTitle(lines[0] || '');
  const statusRaw = ((text.match(/^\*\*Status:\*\*\s*(.*)$/m) || [])[1] || '').trim();
  const severityRaw = ((text.match(/^\*\*Severity:\*\*\s*(.*)$/m) || [])[1] || '').trim();
  const classRaw = ((text.match(/^\*\*Class:\*\*\s*(.*)$/m) || [])[1] || '').trim();
  const foundBy = ((text.match(/^\*\*Found by:\*\*\s*(.*)$/m) || [])[1] || '').trim();
  const klass = classRaw ? classRaw.split(/\s+/)[0].replace(/[,.;:]+$/, '') : '-';
  return {
    title,
    statusRaw,
    state: normalizeState(statusRaw),
    severityRaw,
    severity: normalizeSeverity(severityRaw),
    class: klass || '-',
    foundBy,
  };
}

// --- issue directory access ---------------------------------------------

export function listIssueIds(root) {
  const dir = issuesDir(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .map((name) => {
      const m = /^(\d{3})-(.*)$/.exec(name);
      return m ? { id: m[1], slug: m[2], dirName: name } : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.id.localeCompare(b.id));
}

export function findIssue(root, idInput) {
  const n = parseInt(String(idInput).replace(/\D/g, ''), 10);
  if (Number.isNaN(n)) return null;
  const padded = pad3(n);
  return listIssueIds(root).find((x) => x.id === padded) || null;
}

export function issueDirPath(root, idInput) {
  const found = findIssue(root, idInput);
  return found ? join(issuesDir(root), found.dirName) : null;
}

export function readIssue(root, idInput) {
  const found = findIssue(root, idInput);
  if (!found) return null;
  const dir = join(issuesDir(root), found.dirName);
  const issuePath = join(dir, 'issue.md');
  const text = existsSync(issuePath) ? readFileSync(issuePath, 'utf8') : '';
  return { id: found.id, slug: found.slug, dir, issuePath, logPath: join(dir, 'log.md'), text, ...parseIssueText(text) };
}

export function listIssues(root) {
  return listIssueIds(root).map(({ id, slug, dirName }) => {
    const issuePath = join(issuesDir(root), dirName, 'issue.md');
    const text = existsSync(issuePath) ? readFileSync(issuePath, 'utf8') : '';
    return { id, slug, dir: join(issuesDir(root), dirName), ...parseIssueText(text) };
  });
}

export function nextId(root) {
  const ids = listIssueIds(root).map((x) => parseInt(x.id, 10)).filter((n) => !Number.isNaN(n));
  const max = ids.length ? Math.max(...ids) : 0;
  return pad3(max + 1);
}

export function computeLedger(root) {
  const issues = listIssues(root);
  const byState = {};
  const bySeverity = {};
  const open = [];
  for (const it of issues) {
    byState[it.state] = (byState[it.state] || 0) + 1;
    bySeverity[it.severity] = (bySeverity[it.severity] || 0) + 1;
    if (!CLOSED_STATES.has(it.state)) open.push({ id: it.id, title: it.title });
  }
  return { total: issues.length, byState, bySeverity, open };
}

function issueTemplate({ id, title, foundBy, severity, klass }) {
  const date = todayDate();
  const fb = foundBy && foundBy.trim() ? foundBy.trim() : '-';
  const sev = severity || 'unknown';
  const cls = klass || '-';
  return `# ${id} · ${title}\n\n**Status:** OPEN\n**Found by:** ${fb}, ${date}\n**Severity:** ${sev}\n**Class:** ${cls}\n\n## Symptom\n\n## Suspected area\n\n## What is NOT in scope\n\n## Acceptance\n`;
}

export function createIssue(root, { slug, title, severity, klass, foundBy }) {
  if (!title || !title.trim()) throw new Error('--title is required');
  if (severity && !['high', 'medium', 'low'].includes(severity.toLowerCase())) {
    throw new Error(`--severity must be one of: high, medium, low (got '${severity}')`);
  }
  const id = nextId(root);
  const cleanSlug = String(slug || '').trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'ticket';
  const dirName = `${id}-${cleanSlug}`;
  const dir = join(issuesDir(root), dirName);
  if (existsSync(dir)) throw new Error(`${dirName} already exists`);
  mkdirSync(dir, { recursive: true });
  const text = issueTemplate({ id, title: title.trim(), foundBy, severity: severity ? severity.toLowerCase() : undefined, klass });
  writeFileSync(join(dir, 'issue.md'), text);
  writeFileSync(join(dir, 'log.md'), '');
  return { id, slug: cleanSlug, dir, dirName };
}

export function setStatus(root, idInput, state, note) {
  const norm = String(state).toLowerCase();
  if (!ALLOWED_STATES.includes(norm)) {
    throw new Error(`unknown state '${state}' — allowed: ${ALLOWED_STATES.join(', ')}`);
  }
  const issue = readIssue(root, idInput);
  if (!issue) throw new Error(`no ticket matching '${idInput}'`);
  if (!/^\*\*Status:\*\*.*$/m.test(issue.text)) throw new Error(`${issue.id}: issue.md has no **Status:** line`);
  const newLine = note && String(note).trim()
    ? `**Status:** ${norm.toUpperCase()} — ${String(note).trim()}`
    : `**Status:** ${norm.toUpperCase()}`;
  const updated = issue.text.replace(/^\*\*Status:\*\*.*$/m, newLine);
  writeFileSync(issue.issuePath, updated);
  return { id: issue.id, state: norm, note: note || null };
}

export function appendLog(root, idInput, text) {
  const issue = readIssue(root, idInput);
  if (!issue) throw new Error(`no ticket matching '${idInput}'`);
  const existing = existsSync(issue.logPath) ? readFileSync(issue.logPath, 'utf8') : '';
  const entry = `\n## ${nowStamp()} — ${text}\n`;
  writeFileSync(issue.logPath, existing + entry);
  return { id: issue.id };
}

export function grepIssues(root, pattern, flags = '') {
  const re = new RegExp(pattern, flags);
  const results = [];
  for (const { id, dirName } of listIssueIds(root)) {
    for (const file of ['issue.md', 'log.md']) {
      const p = join(issuesDir(root), dirName, file);
      if (!existsSync(p)) continue;
      const lines = readFileSync(p, 'utf8').split('\n');
      for (const line of lines) {
        if (re.test(line)) results.push({ id, file, line });
      }
    }
  }
  return results;
}

// --- CLI -------------------------------------------------------------------

function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  if (!cmd || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    process.exit(cmd ? 0 : 1);
  }
  const rest = argv.slice(1);

  if (cmd === 'list') {
    const { flags } = parseArgs(rest, { boolean: ['open'] });
    const root = findRepoRoot(import.meta.url, flags.root);
    let issues = listIssues(root);
    if (flags.state) {
      const wanted = new Set(flags.state.split(',').map((s) => s.trim().toLowerCase()));
      issues = issues.filter((i) => wanted.has(i.state));
    }
    if (flags.severity) issues = issues.filter((i) => i.severity === flags.severity.toLowerCase());
    if (flags.class) issues = issues.filter((i) => i.class === flags.class);
    if (flags.open) issues = issues.filter((i) => !CLOSED_STATES.has(i.state));
    if (flags.json) {
      console.log(JSON.stringify(issues.map((i) => ({ id: i.id, state: i.state, severity: i.severity, class: i.class, title: i.title })), null, 2));
    } else {
      printTable(issues, [
        { key: 'id', header: 'id' },
        { key: 'state', header: 'state' },
        { key: 'severity', header: 'severity' },
        { key: 'class', header: 'class' },
        { key: 'title', header: 'title' },
      ]);
    }
    return;
  }

  if (cmd === 'show') {
    const { flags, positional } = parseArgs(rest, { boolean: ['log'] });
    const root = findRepoRoot(import.meta.url, flags.root);
    const id = positional[0];
    if (!id) fail('usage: tk show NNN [--log]');
    const issue = readIssue(root, id);
    if (!issue) fail(`no ticket matching '${id}'`);
    if (flags.log) {
      const logText = existsSync(issue.logPath) ? readFileSync(issue.logPath, 'utf8') : '';
      if (flags.json) console.log(JSON.stringify({ id: issue.id, log: logText }, null, 2));
      else process.stdout.write(logText);
    } else {
      if (flags.json) console.log(JSON.stringify({ id: issue.id, ...issue, text: issue.text }, null, 2));
      else process.stdout.write(issue.text);
    }
    return;
  }

  if (cmd === 'new') {
    const { flags, positional } = parseArgs(rest, {});
    const root = findRepoRoot(import.meta.url, flags.root);
    const slug = positional[0];
    if (!slug) fail('usage: tk new <slug> --title "<t>" [--severity high|medium|low] [--class X] [--found-by "<who>"]');
    try {
      const created = createIssue(root, { slug, title: flags.title, severity: flags.severity, klass: flags.class, foundBy: flags['found-by'] });
      if (flags.json) console.log(JSON.stringify(created, null, 2));
      else console.log(created.id);
    } catch (e) {
      fail(e.message);
    }
    return;
  }

  if (cmd === 'status') {
    const { flags, positional } = parseArgs(rest, {});
    const root = findRepoRoot(import.meta.url, flags.root);
    const [id, state, note] = positional;
    if (!id || !state) fail('usage: tk status NNN <state> ["<note>"]');
    try {
      const result = setStatus(root, id, state, note);
      if (flags.json) console.log(JSON.stringify(result, null, 2));
      else console.log(`${result.id}: ${result.state}${result.note ? ' — ' + result.note : ''}`);
    } catch (e) {
      fail(e.message);
    }
    return;
  }

  if (cmd === 'log') {
    const { flags, positional } = parseArgs(rest, {});
    const root = findRepoRoot(import.meta.url, flags.root);
    const [id, text] = positional;
    if (!id || !text) fail('usage: tk log NNN "<text>"');
    try {
      const result = appendLog(root, id, text);
      if (flags.json) console.log(JSON.stringify(result, null, 2));
      else console.log(`${result.id}: logged`);
    } catch (e) {
      fail(e.message);
    }
    return;
  }

  if (cmd === 'ledger') {
    const { flags } = parseArgs(rest, {});
    const root = findRepoRoot(import.meta.url, flags.root);
    const ledger = computeLedger(root);
    if (flags.json) {
      console.log(JSON.stringify(ledger, null, 2));
    } else {
      console.log(`total: ${ledger.total}`);
      console.log('by state:');
      for (const [k, v] of Object.entries(ledger.byState).sort()) console.log(`  ${k}: ${v}`);
      console.log('by severity:');
      for (const [k, v] of Object.entries(ledger.bySeverity).sort()) console.log(`  ${k}: ${v}`);
      console.log(`open (${ledger.open.length}):`);
      for (const o of ledger.open) console.log(`  ${o.id}  ${o.title}`);
    }
    return;
  }

  if (cmd === 'next') {
    const { flags } = parseArgs(rest, {});
    const root = findRepoRoot(import.meta.url, flags.root);
    const id = nextId(root);
    console.log(flags.json ? JSON.stringify({ id }) : id);
    return;
  }

  if (cmd === 'grep') {
    const { flags, positional } = parseArgs(rest, { boolean: ['i'] });
    const root = findRepoRoot(import.meta.url, flags.root);
    const pattern = positional[0];
    if (!pattern) fail('usage: tk grep <regex> [-i]');
    const reFlags = rest.includes('-i') ? 'i' : '';
    let results;
    try {
      results = grepIssues(root, pattern, reFlags);
    } catch (e) {
      fail(`bad regex: ${e.message}`);
    }
    if (flags.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      for (const r of results) console.log(`${r.id}: ${r.line}`);
    }
    return;
  }

  fail(`unknown command '${cmd}' — see --help`);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
