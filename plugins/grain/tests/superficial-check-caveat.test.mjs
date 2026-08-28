// Regression test for a `check` honesty gap: the existing "only file-level style is certified here … that is not
// approval" caveat (cmdCheck in grain.mjs) only fired when every governing fact's scope KIND was 'file'. A file whose
// only governing conventions are `auto.nameshape` / `auto.filenameshape` — a class or method named in a consistent
// shape — sits on a `type` or `method` kind scope, not `file`, so the old condition missed it: `check` printed a
// populated, review-shaped "conforms to:" line with no caveat for a file that is, in substance, exactly as
// superficially governed as one certified only by quote style or import order.
//
// Fixed by broadening the condition from a scope-KIND check to a PID-FAMILY check (mirrors the existing PID-family
// precedent already used a few lines below in cmdCheck, and STRUCT_PID in core.mjs): the caveat fires when every
// governing fact is either `kind === 'file'` (file-level style, as before) OR its `pid` is `auto.nameshape`,
// `auto.filenameshape`, or `auto.lex:*` (the lexical-surface family) — regardless of which scope kind it sits on.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const dateEnv = iso => ({ GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: iso, GIT_COMMITTER_DATE: iso });
const git = (env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } });
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-superficial-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git({}, 'init', '-q', '-b', 'main'); git({}, 'config', 'commit.gpgsign', 'false');
  // 20 model classes: nothing governs them beyond naming (PascalCase types, single-lowercase-word methods) and
  // file-level lexical/export style — no shared decorator, supertype or call, no directory large enough to matter
  for (let i = 0; i < 20; i++) w(`src/models/Model${i}.ts`, `export class Model${i}Model {\n  compute() {\n    return ${i};\n  }\n}\n`);
  // 30 handler classes: a real, maintainer-chosen convention (@Handler() on all of them) governs them too, in a
  // directory large enough (>= dirMin) to speak as its own local group/directory fact
  for (let i = 0; i < 30; i++) w(`src/handlers/Handler${i}.ts`, `@Handler()\nexport class Handler${i}Handler {\n  run() {\n    return ${i};\n  }\n}\n`);
  git(dateEnv('2026-01-10T12:00:00Z'), 'add', 'src/models');
  git(dateEnv('2026-01-10T12:00:00Z'), 'commit', '-qm', 'add models');
  git(dateEnv('2026-02-01T12:00:00Z'), 'add', 'src/handlers');
  git(dateEnv('2026-02-01T12:00:00Z'), 'commit', '-qm', 'add handlers');
  w('NOTES.md', 'notes\n'); // pushes HEAD's own timestamp forward so the code above clears freshDays and is "established"
  git(dateEnv('2026-03-01T12:00:00Z'), 'add', 'NOTES.md');
  git(dateEnv('2026-03-01T12:00:00Z'), 'commit', '-qm', 'notes');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(st.status, 0, st.stdout + st.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return (r.stdout || '').replace(/\n$/, ''); };

test('a file governed only by naming/lexical facts on type/method-kind scopes gets the superficial caveat', () => {
  const out = grain(['check', 'src/models/Model0.ts']);
  assert.match(out, /conforms to: /, 'sanity: the file is governed by something');
  assert.match(out, /named PascalCase/, 'sanity: governed by a type-kind nameshape fact, not a file-kind one');
  assert.match(out, /only naming and lexical style is certified here/, `expected the superficial caveat: ${out}`);
});

test('a file governed by a real semantic convention (a decorator) does NOT get the superficial caveat', () => {
  const out = grain(['check', 'src/handlers/Handler0.ts']);
  assert.match(out, /annotated with `@Handler`/, 'sanity: governed by a real, non-superficial convention');
  assert.doesNotMatch(out, /only naming and lexical style is certified here/, `the caveat must not fire when a real convention governs: ${out}`);
});
