#!/usr/bin/env node
// status — session-start digest for the director skill. ~25 lines, human or --json.
// Zero dependencies. Run from the repo root:
//   node .claude/skills/director/scripts/status.mjs [--json] [--root <path>]
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { findRepoRoot, lastSuitePath, readJSONSafe, parseArgs } from './_lib.mjs';
import { computeLedger } from './tk.mjs';
import { summarizeQueue } from './queue.mjs';

const HELP = `status — session-start digest (HEAD, versions, branches, worktrees, tickets, queue, last suite)

Usage:
  node status.mjs [--json] [--root <path>]
`;

const BRANCH_RE = /^(fix|instr|research|explore|skill)\//;
const MAIN = 'main';

function git(args, root) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function gitLines(args, root) {
  const out = git(args, root);
  return out ? out.split('\n').map((s) => s.trim()).filter(Boolean) : [];
}

function headInfo(root) {
  return {
    sha: git(['rev-parse', '--short', 'HEAD'], root) || 'unknown',
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD'], root) || 'unknown',
    uncommitted: (git(['status', '--porcelain'], root) || '').split('\n').filter(Boolean).length,
  };
}

function versionConstants(root) {
  const cfgPath = join(root, 'plugins', 'grain', 'engine', 'config.mjs');
  const out = {};
  if (!existsSync(cfgPath)) return out;
  const text = readFileSync(cfgPath, 'utf8');
  for (const name of ['ENGINE_VERSION', 'EXTR_V', 'HIST_V', 'MODEL_V']) {
    const m = new RegExp(`export const ${name}\\s*=\\s*'([^']+)'`).exec(text);
    if (m) out[name] = m[1];
  }
  return out;
}

function branchInfo(root) {
  const all = gitLines(['for-each-ref', 'refs/heads', '--format=%(refname:short)'], root);
  const matching = all.filter((b) => BRANCH_RE.test(b));
  const mergedSet = new Set(gitLines(['branch', '--merged', MAIN, '--format=%(refname:short)'], root));
  const mainTip = git(['rev-parse', MAIN], root);
  return matching.map((b) => {
    const merged = mergedSet.has(b);
    const mergeBase = git(['merge-base', b, MAIN], root);
    let staleBase = false;
    if (!merged && mergeBase && mainTip && mergeBase !== mainTip) {
      const touching = git(['log', '--oneline', `${mergeBase}..${mainTip}`, '--', 'plugins/grain/'], root);
      staleBase = !!(touching && touching.length);
    }
    return { branch: b, merged, mergeBase, staleBase };
  });
}

function worktreeCount(root) {
  return gitLines(['worktree', 'list'], root).length;
}

export function buildDigest(root) {
  const head = headInfo(root);
  const versions = versionConstants(root);
  const branches = branchInfo(root);
  const worktrees = worktreeCount(root);
  const ledger = computeLedger(root);
  const queue = summarizeQueue(root);
  const lastSuite = readJSONSafe(lastSuitePath(root), null);
  return { head, versions, branches, worktrees, ledger, queue, lastSuite };
}

function printDigest(d) {
  console.log(`HEAD ${d.head.sha} on ${d.head.branch} (${d.head.uncommitted} uncommitted)`);
  const vparts = Object.entries(d.versions).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`versions: ${vparts || '(config.mjs not found)'}`);
  console.log(`worktrees: ${d.worktrees}`);
  console.log(`branches (${d.branches.length}):`);
  if (d.branches.length === 0) console.log('  (none matching fix/|instr/|research/|explore/|skill/)');
  for (const b of d.branches) {
    const flag = b.staleBase ? '  STALE BASE' : '';
    console.log(`  ${b.branch}  merged=${b.merged ? 'y' : 'n'}  base=${b.mergeBase ? b.mergeBase.slice(0, 7) : '?'}${flag}`);
  }
  console.log(`tickets: total ${d.ledger.total}`);
  const stateParts = Object.entries(d.ledger.byState).sort().map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`  by state: ${stateParts || '(none)'}`);
  const sevParts = Object.entries(d.ledger.bySeverity).sort().map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`  by severity: ${sevParts || '(none)'}`);
  console.log(`  open: ${d.ledger.open.length}`);
  console.log(`queue: total ${d.queue.total}`);
  const qParts = Object.entries(d.queue.byState).map(([k, v]) => `${k}=${v}`).join(' ');
  console.log(`  by state: ${qParts}`);
  if (d.lastSuite) {
    console.log(`last suite: ${d.lastSuite.pass}/${d.lastSuite.tests} pass, ${d.lastSuite.fail} fail, ${d.lastSuite.todo} todo (sha ${d.lastSuite.sha}, at ${d.lastSuite.at})`);
  } else {
    console.log('last suite: (no .system/cache/last-suite.json)');
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(HELP);
    return;
  }
  const { flags } = parseArgs(argv, {});
  const root = findRepoRoot(import.meta.url, flags.root);
  const digest = buildDigest(root);
  if (flags.json) console.log(JSON.stringify(digest, null, 2));
  else printDigest(digest);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
