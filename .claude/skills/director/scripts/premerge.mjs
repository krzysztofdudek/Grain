#!/usr/bin/env node
// premerge <branch> — the lead's pre-merge checklist, automated.
// Zero dependencies. Run from the repo root:
//   node .claude/skills/director/scripts/premerge.mjs <branch> [--no-suite] [--json] [--root <path>]
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { findRepoRoot, lastSuitePath, writeJSON, fail, parseArgs, nowStamp } from './_lib.mjs';

const HELP = `premerge <branch> — automated pre-merge checklist

Usage:
  node premerge.mjs <branch> [--no-suite] [--json] [--root <path>]

Checks:
  1. base freshness   — branch is rooted at main's tip, or already merged, or main has no
                         plugins/grain/ commits the branch is missing (else STALE BASE)
  2. version constants — if engine/config.mjs changed, did a version constant line change too
                         (informational flag, printed above the checklist)
  3. revert-test      — new test files in the diff, extracted onto this tree and run there;
                         must show at least one failure (0 failures = not load-bearing)
  4. full suite       — the branch's own worktree, npm test, must be green (skip with --no-suite)

Exits non-zero if any checklist item is ✗. Never modifies main's tracked files.
`;

const MAIN = 'main';
const CONFIG_PATH = 'plugins/grain/engine/config.mjs';

function git(args, root) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function gitLines(args, root) {
  const out = git(args, root);
  return out ? out.split('\n').filter(Boolean) : [];
}

// Strip NODE_TEST_CONTEXT so a nested `node --test` (this script may itself be invoked
// from inside a `node --test` run, e.g. by its own test suite) isn't skipped as a
// perceived recursive call — Node's test runner treats that env var as a marker that
// it's already inside a test run and silently no-ops a nested one.
function childEnv() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function runCapture(cmd, args, opts) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', env: childEnv(), ...opts });
  } catch (e) {
    return (e.stdout || '') + (e.stderr || '');
  }
}

export function parseNodeTestSummary(output) {
  // Node <= 22 defaults to the TAP reporter when stdout is not a TTY ("# tests N");
  // Node >= 23 defaults to spec ("ℹ tests N"). Accept both — CI runs node 22 and 24.
  const extract = (name) => {
    const re = new RegExp(`^(?:ℹ|#) ${name} (\\d+)`, 'gm');
    const matches = [...output.matchAll(re)];
    return matches.length ? parseInt(matches[matches.length - 1][1], 10) : null;
  };
  return { tests: extract('tests'), pass: extract('pass'), fail: extract('fail'), todo: extract('todo') };
}

function findWorktreePath(root, branch) {
  const out = git(['worktree', 'list', '--porcelain'], root) || '';
  const blocks = out.split(/\n\n+/);
  for (const block of blocks) {
    const wtMatch = /^worktree (.+)$/m.exec(block);
    const brMatch = /^branch refs\/heads\/(.+)$/m.exec(block);
    if (wtMatch && brMatch && brMatch[1] === branch) return wtMatch[1];
  }
  return null;
}

export function runPremerge(root, branch, { noSuite = false } = {}) {
  const branchSha = git(['rev-parse', '--verify', branch], root);
  if (!branchSha) throw new Error(`no such branch or ref: '${branch}'`);
  const mainTip = git(['rev-parse', MAIN], root);
  if (!mainTip) throw new Error(`could not resolve '${MAIN}'`);

  // (1) base freshness
  const mergedBranches = new Set(gitLines(['branch', '--merged', MAIN, '--format=%(refname:short)'], root));
  const merged = mergedBranches.has(branch);
  const mergeBase = git(['merge-base', branch, MAIN], root);
  let staleBase = false;
  if (!merged && mergeBase && mergeBase !== mainTip) {
    const touching = git(['log', '--oneline', `${mergeBase}..${mainTip}`, '--', 'plugins/grain/'], root);
    staleBase = !!(touching && touching.length);
  }

  // (2) diff stat + file list
  const diffStat = git(['diff', `${MAIN}..${branch}`, '--stat'], root) || '';
  const fileList = gitLines(['diff', `${MAIN}..${branch}`, '--name-only'], root);
  const nameStatus = gitLines(['diff', `${MAIN}..${branch}`, '--name-status'], root)
    .map((l) => { const parts = l.split('\t'); return { status: parts[0], path: parts.slice(1).join('\t') }; });

  // (3) version constants
  const configChanged = fileList.includes(CONFIG_PATH);
  let versionChanged = false;
  if (configChanged) {
    const configDiff = git(['diff', `${MAIN}..${branch}`, '--', CONFIG_PATH], root) || '';
    versionChanged = /^[+-]\s*export const (ENGINE_VERSION|EXTR_V|HIST_V|MODEL_V)\s*=/m.test(configDiff);
  }
  const versionCheckOk = !configChanged || versionChanged;

  // (4) revert-test: new test files, extracted onto this tree, run, must show >=1 failure
  const newTestFiles = nameStatus
    .filter((e) => e.status === 'A' && /^plugins\/grain\/tests\/[^/]+\.test\.mjs$/.test(e.path))
    .map((e) => e.path);

  const revertTest = { applicable: newTestFiles.length > 0, files: [], ok: true };
  for (const relPath of newTestFiles) {
    const content = git(['show', `${branch}:${relPath}`], root);
    if (content === null) {
      revertTest.ok = false;
      revertTest.files.push({ path: relPath, error: 'could not extract from branch' });
      continue;
    }
    const absPath = join(root, relPath);
    const existedBefore = existsSync(absPath);
    const backup = existedBefore ? readFileSync(absPath, 'utf8') : null;
    try {
      mkdirSync(dirname(absPath), { recursive: true });
      writeFileSync(absPath, content);
      const grainRoot = join(root, 'plugins', 'grain');
      const relToGrain = relPath.replace(/^plugins\/grain\//, '');
      const out = runCapture('node', ['--test', relToGrain], { cwd: grainRoot });
      const summary = parseNodeTestSummary(out);
      revertTest.files.push({ path: relPath, ...summary });
      if (!summary.fail) revertTest.ok = false; // zero failures on main => not load-bearing
    } finally {
      if (existedBefore) writeFileSync(absPath, backup);
      else if (existsSync(absPath)) unlinkSync(absPath);
    }
  }

  // (5) full suite in the branch's own worktree
  const suite = { skipped: !!noSuite, ok: true, path: null, summary: null, error: null };
  if (!suite.skipped) {
    const wtPath = findWorktreePath(root, branch);
    if (!wtPath) {
      suite.ok = false;
      suite.error = `no worktree checked out for '${branch}' (git worktree list)`;
    } else {
      suite.path = wtPath;
      const out = runCapture('npm', ['test'], { cwd: join(wtPath, 'plugins', 'grain') });
      const summary = parseNodeTestSummary(out);
      suite.summary = summary;
      suite.ok = summary.fail === 0 && summary.tests !== null;
      if (summary.tests !== null) {
        writeJSON(lastSuitePath(root), {
          tests: summary.tests, pass: summary.pass, fail: summary.fail, todo: summary.todo,
          sha: branchSha.slice(0, 7), at: nowStamp(),
        });
      }
    }
  }

  const checks = [
    {
      name: 'base freshness',
      ok: !staleBase,
      note: staleBase
        ? `STALE BASE — merge-base ${mergeBase.slice(0, 7)} vs main ${mainTip.slice(0, 7)}; main has plugins/grain/ commits the branch lacks`
        : merged ? 'already merged into main' : 'rooted at main tip (or no missed plugins/grain/ commits)',
    },
    {
      name: 'version constants',
      ok: versionCheckOk,
      note: !configChanged
        ? 'config.mjs untouched'
        : versionChanged ? 'config.mjs changed, a version constant line changed too'
          : 'config.mjs changed but no version constant line changed — verify intentional',
    },
    {
      name: 'revert-test (new tests red on main)',
      ok: revertTest.ok,
      note: newTestFiles.length
        ? revertTest.files.map((f) => f.error ? `${f.path}: ${f.error}` : `${f.path} (${f.fail ?? '?'} fail / ${f.tests ?? '?'} tests)`).join(', ')
        : 'no new test files in diff',
    },
    {
      name: 'full suite (branch worktree)',
      ok: suite.skipped || suite.ok,
      note: suite.skipped
        ? 'skipped (--no-suite)'
        : suite.path
          ? `${suite.summary.pass}/${suite.summary.tests} pass, ${suite.summary.fail} fail, ${suite.summary.todo} todo`
          : suite.error,
    },
  ];
  const allOk = checks.every((c) => c.ok);

  return {
    branch, branchSha, mainTip, merged, mergeBase, staleBase,
    diffStat, fileList, configChanged, versionChanged,
    revertTest, suite, checks, allOk,
  };
}

function printReport(r) {
  console.log(`premerge ${r.branch} (vs ${MAIN})`);
  console.log(r.diffStat.trim() || '(no diff)');
  console.log('');
  for (const c of r.checks) console.log(`${c.ok ? '✓' : '✗'} ${c.name} — ${c.note}`);
  console.log('');
  console.log(r.allOk ? 'READY' : 'NOT READY');
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    console.log(HELP);
    process.exit(argv.length === 0 ? 1 : 0);
  }
  const { flags, positional } = parseArgs(argv, { boolean: ['no-suite'] });
  const branch = positional[0];
  if (!branch) fail('usage: premerge <branch> [--no-suite] [--json] [--root <path>]');
  const root = findRepoRoot(import.meta.url, flags.root);
  let result;
  try {
    result = runPremerge(root, branch, { noSuite: flags['no-suite'] });
  } catch (e) {
    fail(e.message);
  }
  if (flags.json) console.log(JSON.stringify(result, null, 2));
  else printReport(result);
  process.exit(result.allOk ? 0 : 1);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) main();
