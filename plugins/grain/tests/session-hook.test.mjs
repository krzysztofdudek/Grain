// The SessionStart hook (`grain session-context`, ticket 028 "Grain jako wejście do rodziny"): what a session
// sees the moment it opens a repository. Three new things land here: a repository that already runs Yggdrasil
// is pointed at `yg prime` (and at installing `yg` when it is missing), and a sparse model gets a line of its
// own instead of being read off `Index:` alone (Grain 2, mission triage). Every new branch is additive — a
// repository with no `.yggdrasil/` must see the SAME bytes it saw before this command existed (the comment at
// engine/grain-session.mjs:72-77 says so in the source itself); that regression is the single most important
// assertion in this file, because this hook runs once at the start of every session, in every repository.
//
// `.grain/cache/{meta,model}.json` are written by hand below, not mined — `signal()` (grain-report.mjs) reads
// only `facts`/`medoids`/`files` off a model's partitions, and `sessionContext` itself touches nothing else on
// `model` unless a field is present, so a fixture this small exercises exactly what this hook reads and nothing
// a real corpus would have added by accident.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = join(HERE, '..', 'bin', 'grain.mjs');
const bin = `node "${BIN}"`;

let tmp, repo, headSha, noYgPath, ygPath;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2024-01-15T12:00:00Z', GIT_COMMITTER_DATE: '2024-01-15T12:00:00Z' };
const git = (r, ...a) => execFileSync('git', ['-C', r, ...a], { encoding: 'utf8', env: { ...process.env, ...gitEnv } });

function writeIndex(r, { facts, groups, files }) {
  mkdirSync(join(r, '.grain', 'cache'), { recursive: true });
  writeFileSync(join(r, '.grain', 'cache', 'meta.json'), JSON.stringify({ headSha }));
  writeFileSync(join(r, '.grain', 'cache', 'model.json'), JSON.stringify({
    files,
    partitions: [{
      facts: Array.from({ length: facts }, (_, i) => ({ pid: `f${i}` })),
      medoids: Array.from({ length: groups }, (_, i) => ({ id: `g${i}` })),
      files: Array.from({ length: files }, (_, i) => `f${i}.ts`),
    }],
  }, null, 1));
}
const sessionContext = (r, { mode = 'claude', PATH } = {}) => {
  // `YG_BIN` is stripped unconditionally — `resolveYg` (propose-base.mjs) checks it BEFORE ever consulting
  // PATH, so a `YG_BIN` set in the environment this suite happens to run under (the full test run sets it to a
  // real built bin.js) would silently defeat every PATH-only scenario below, "yg not on PATH" included.
  const { YG_BIN, ...envWithoutYgBin } = process.env;
  const res = spawnSync('node', [BIN, 'session-context', '--mode', mode], {
    cwd: r, encoding: 'utf8', env: PATH ? { ...envWithoutYgBin, PATH } : envWithoutYgBin,
  });
  assert.equal(res.status, 0, res.stderr);
  return JSON.parse(res.stdout).hookSpecificOutput.additionalContext;
};

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-sessionhook-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git(repo, 'init', '-q', '-b', 'main'); git(repo, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'README.md'), 'hello\n');
  git(repo, 'add', '-A'); git(repo, 'commit', '-qm', 'base');
  headSha = git(repo, 'rev-parse', 'HEAD').trim();

  // Two controlled PATHs, neither trusting whatever the host machine happens to have installed: `node`'s own
  // bin dir is NOT reused directly — an `npm i -g` of the real `yg` lands in that exact same directory (proven
  // empirically: on this machine `dirname(process.execPath)` IS where `yg` lives), so a "no yg" PATH must give
  // `node` its own isolated symlink instead. One PATH carries only that symlink plus the standard-utility dir
  // (so `which`/`git` still run, but `yg` is genuinely unresolvable); the other adds a stub `yg` ahead of it —
  // `resolveYg` only checks that `which yg` exits 0 and reports a path, it never runs the binary for this code
  // path, so a one-line stub is enough to prove the branch.
  const stdUtilDirs = '/usr/bin:/bin';
  const nodeOnlyDir = join(tmp, 'path-node-only'); mkdirSync(nodeOnlyDir);
  symlinkSync(process.execPath, join(nodeOnlyDir, 'node'));
  noYgPath = `${nodeOnlyDir}:${stdUtilDirs}`;

  const ygDir = join(tmp, 'path-with-yg'); mkdirSync(ygDir);
  writeFileSync(join(ygDir, 'yg'), '#!/bin/sh\nexit 0\n');
  chmodSync(join(ygDir, 'yg'), 0o755);
  ygPath = `${ygDir}:${nodeOnlyDir}:${stdUtilDirs}`;
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('no .yggdrasil/: output is exactly the pre-028 six lines (regression — grain-session.mjs:72-77)', () => {
  rmSync(join(repo, '.yggdrasil'), { recursive: true, force: true });
  writeIndex(repo, { facts: 10, groups: 5, files: 50 }); // 10/50 = 20% — "a moderate model", never sparse
  const text = sessionContext(repo);
  const expected = [
    `grain is available here: a convention oracle mined from this repo's code and git history. It names WHICH directory, group, marker or file to open and the exemplar to copy, with evidence. Run the grain command below from the repo root via Bash; every answer ends with \`as of <sha>\`. grain is its own tool, invoked via node — a denial of some unrelated command (pnpm, npm, a bare node script, …) earlier in this session says nothing about whether grain itself is blocked; it has not been tried yet.`,
    `  grain where <intent words>   — before creating a source file or when unsure where something belongs; use the repo's own words (a decorator, a base type, a file or function name). One call per intent; a compact map = no hit: open the closest entry, do not re-ask with synonyms. Run: \`${bin} where <intent words>\`. Same moment, what must come with it: \`grain obligation <path>\` (same invocation form).`,
    `  grain check <file>           — after you wrote or edited a file: deviations IN YOUR CHANGE (evidence + exemplars); pre-existing ones folded. Zero deviations is not a review. Runs automatically after every edit in this session — a [grain] note after an edit is this; silence means nothing certified to say, NOT approval. Run: \`${bin} check <file>\`. Before you consider the change done: \`grain completeness <file>\` for co-changing files you may have missed.`,
    `  grain status | report        — size, freshness, top conventions. Run: \`${bin} status\` or \`${bin} report\`.`,
    `Index: ready: 50 files, 5 groups, 10 conventions in source code (a moderate model).`,
    `This repository has no architecture graph yet (no .yggdrasil/). When the task is to adopt Yggdrasil here, or to write down the architecture this repo already practises, \`grain propose\` mines one — nodes, relations and rules with the evidence attached — into .yggdrasil-proposal/ for a human to review and move in. Run: \`${bin} propose\`.`,
  ].join('\n');
  assert.equal(text, expected, 'a repository with no .yggdrasil/ must see exactly the bytes it saw before ticket 028 — nothing from item (2)/(2b) may leak in here');
  assert.doesNotMatch(text, /yg prime/);
  assert.doesNotMatch(text, /sparse model/);
});

// Each test below sets up its own `.yggdrasil` state from scratch (remove, then recreate as needed) rather
// than relying on a previous test's cleanup — `repo` is shared across this file's tests, and node's test
// runner gives no guarantee about their relative order.
test('.yggdrasil/ present, `yg` on PATH: names `yg prime`, no install line', () => {
  rmSync(join(repo, '.yggdrasil'), { recursive: true, force: true });
  mkdirSync(join(repo, '.yggdrasil'), { recursive: true });
  writeIndex(repo, { facts: 10, groups: 5, files: 50 });
  const text = sessionContext(repo, { PATH: ygPath });
  assert.match(text, /This repository runs Yggdrasil; read `yg prime` before changing code, and ask grain where a change belongs\./);
  assert.doesNotMatch(text, /npm i -g @chrisdudek\/yg/, 'yg is on PATH — the install line must not fire');
});

test('.yggdrasil/ present, `yg` NOT on PATH: names the install command', () => {
  rmSync(join(repo, '.yggdrasil'), { recursive: true, force: true });
  mkdirSync(join(repo, '.yggdrasil'), { recursive: true });
  writeIndex(repo, { facts: 10, groups: 5, files: 50 });
  const text = sessionContext(repo, { PATH: noYgPath });
  assert.match(text, /read `yg prime`/);
  assert.match(text, /npm i -g @chrisdudek\/yg/);
});

test('.yggdrasil is a FILE, not a directory: does not crash, still reads as "present"', () => {
  rmSync(join(repo, '.yggdrasil'), { recursive: true, force: true });
  writeFileSync(join(repo, '.yggdrasil'), 'not a directory\n');
  writeIndex(repo, { facts: 10, groups: 5, files: 50 });
  const text = sessionContext(repo, { PATH: ygPath });
  assert.match(text, /read `yg prime`/);
});

test('a sparse model prints the sparse-model sentence verbatim (grain-report.mjs:189)', () => {
  rmSync(join(repo, '.yggdrasil'), { recursive: true, force: true });
  writeIndex(repo, { facts: 3, groups: 2, files: 50 }); // 3/50 = 6% < 8% — sparse
  const text = sessionContext(repo);
  assert.match(text, /^a sparse model — expect placement, not shape; read an exemplar$/m);
});

test('a rich model does not print the sparse-model sentence', () => {
  rmSync(join(repo, '.yggdrasil'), { recursive: true, force: true });
  writeIndex(repo, { facts: 40, groups: 5, files: 50 }); // 40/50 = 80% — rich
  const text = sessionContext(repo);
  assert.doesNotMatch(text, /sparse model/);
});

test('no index yet (no .grain/cache/model.json): no new lines, and the hook does not build one as a side effect', () => {
  const empty = join(tmp, 'empty'); mkdirSync(empty);
  git(empty, 'init', '-q', '-b', 'main'); git(empty, 'config', 'commit.gpgsign', 'false');
  writeFileSync(join(empty, 'README.md'), 'hi\n');
  git(empty, 'add', '-A'); git(empty, 'commit', '-qm', 'base');
  mkdirSync(join(empty, '.yggdrasil'), { recursive: true }); // even WITH a graph present, no model means no verdict to read
  const text = sessionContext(empty);
  assert.doesNotMatch(text, /yg prime/);
  assert.doesNotMatch(text, /sparse model/);
  assert.doesNotMatch(text, /npm i -g @chrisdudek\/yg/);
  assert.throws(() => readFileSync(join(empty, '.grain', 'cache', 'model.json')), 'session-context must never build the index as a side effect');
});
