// Regression test for issue 019: `grain map <file>` silently swallowed the file argument and printed the
// whole-repo map — the argument was accepted and dropped without a warning or error, even though `grain help`
// documents `map [--json]` taking no file at all. Easy to misread as a per-file report, since `check`,
// `explain`/`spectrum` and `completeness` ARE file-scoped, so `map <file>` looks like it belongs to that family.
//
// Fix: `map` now rejects a positional argument with a one-line usage error naming the file-scoped alternative
// (`explain`). `parseArgv` is shared by every command, so the audit this ticket asked for went through every
// OTHER argument-less command in the dispatch (`grain.mjs`'s `main()` switch) the same way: `status`, `report`,
// `rules`, `selftest` (named in the ticket), plus `export`, `refresh`, `version` and `review` (found during the
// audit — none of them read `args` at all, or destructured it and never used it, so every one of them silently
// dropped a positional argument exactly like `map` did). All eight are fixed here, the same way, matching the
// existing usage-error style already used by `cmdWhat`/`cmdSpectrum` (`if (!args[0]) throw new Error('usage: ...')`).
//
// Left alone (reported, not fixed — a different bug shape, out of this ticket's scope): `check`/`explain`/
// `spectrum` read only `args[0]` and silently ignore a SECOND positional argument (`grain check a.js b.js` checks
// only `a.js`) — these are not "argument-less" commands, so the fix here does not touch them.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let repo;
const gitEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', env: { ...process.env, ...gitEnv } }).trim();
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };

before(() => {
  repo = mkdtempSync(join(tmpdir(), 'grain-argless-'));
  git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'index.ts'), "export const only = () => 1;\n");
  git('add', '-A'); git('commit', '-qm', 'base');
  const r = grain(['status']); assert.equal(r.code, 0, r.err); // prime the cache, same precedent as map-command.test.mjs
});
after(() => { rmSync(repo, { recursive: true, force: true }); });

test('`grain map <file>` exits non-zero with a usage message naming `explain`', () => {
  const r = grain(['map', 'foo.rs']);
  assert.notEqual(r.code, 0, `expected a non-zero exit, got 0 with stdout: ${r.out}`);
  assert.match(r.err, /usage: grain map/);
  assert.match(r.err, /explain/);
});

test('bare `grain map` is unchanged — still succeeds and still prints the whole-repo map', () => {
  const r = grain(['map']);
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.length > 0);
});

// one case per sibling command found (during the audit) to have the identical bug — each takes NO documented
// positional argument, and each is exercised here with one bogus trailing argument
for (const cmd of ['status', 'report', 'rules', 'export', 'refresh', 'selftest', 'version']) {
  test(`\`grain ${cmd} <file>\` exits non-zero with a usage message (same bug as \`map\`)`, () => {
    const r = grain([cmd, 'foo.rs']);
    assert.notEqual(r.code, 0, `expected a non-zero exit, got 0 with stdout: ${r.out}`);
    assert.match(r.err, new RegExp(`usage: grain ${cmd}\\b`));
  });
}

// `review` is documented as bare `check` with no file argument — found during the audit to have the same bug
// (it destructures `args` but never reads it), and it has a natural file-scoped alternative to name, like `map` does
test('`grain review <file>` exits non-zero with a usage message naming `check`', () => {
  const r = grain(['review', 'foo.rs']);
  assert.notEqual(r.code, 0, `expected a non-zero exit, got 0 with stdout: ${r.out}`);
  assert.match(r.err, /usage: grain review/);
  assert.match(r.err, /check/);
});

test('bare `grain review` is unchanged — still succeeds', () => {
  const r = grain(['review']);
  assert.equal(r.code, 0, r.err);
});

// a representative FILE-SCOPED sibling, included to document the audit's negative result: `explain`/`spectrum`
// correctly REQUIRE a file argument already (this is not the same bug — nothing to fix here)
test('`grain explain` (no file) already correctly rejects — the file-scoped sibling was never affected', () => {
  const r = grain(['explain']);
  assert.notEqual(r.code, 0, r.err);
  assert.match(r.err, /usage: grain spectrum/);
});
