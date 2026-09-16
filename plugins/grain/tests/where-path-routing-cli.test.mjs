// End-to-end: `grain where <path>` (the CLI surface, grain-where.mjs's `cmdWhere`) must actually route a
// path-shaped argument into whereCmd's `pathQuery` disclosure (tests/where-path-routing.test.mjs covers what
// `pathQuery` does, and does not do, to the ranking itself, in isolation). This locks in the CLI-side detection
// (`pathQueryFor`): a real path, existing or not, gets routed; a bare word that merely CONTAINS a slash but names
// nothing in the tree (an idiom, not a path) does not, so ordinary intent queries are unaffected.
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
const git = (env, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: { ...process.env, ...env } }).trim();
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-where-path-'));
  repo = join(tmp, 'r');
  mkdirSync(repo);
  git({}, 'init', '-q', '-b', 'main');
  git({}, 'config', 'commit.gpgsign', 'false');
  const d1 = dateEnv('2026-01-10T12:00:00Z');
  w('src/domain/constants/roles.ts', 'export class Roles {\n  static readonly Admin = "admin";\n}\n');
  w('src/domain/entities/todoItem.ts', 'export class TodoItem {\n  id = 0;\n}\n');
  // filler: clears `groupPartitions`' small-package bucket floor so `src/` forms a real partition, same
  // discipline tests/where-json-member-line.test.mjs uses
  for (let i = 0; i < 12; i++) w(`src/misc/filler${i}.ts`, `export class Filler${i} {\n  doWork() {\n    return ${i};\n  }\n}\n`);
  git(d1, 'add', '-A');
  git(d1, 'commit', '-qm', 'add domain');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' });
  assert.equal(st.status, 0, st.stdout + st.stderr);
});
after(() => rmSync(tmp, { recursive: true, force: true }));

test('`grain where <existing file path>` pins that exact file, not tokenized fragments of it', () => {
  const { out, code, err } = grain(['where', 'src/domain/constants/roles.ts']);
  assert.equal(code, 0, `${out}\n${err}`);
  assert.match(out, /→ file src\/domain\/constants\/roles\.ts/, out);
});

test('`grain where <a path under a directory that does not exist yet>` states the absence instead of guessing', () => {
  // a brand-new TOP-LEVEL directory — its refined module (≤2 segments, `refineModOf`) holds no files at all,
  // unlike `src/domain/valueObjects/…` (a third-level path under the already-real `src/domain` module, which
  // `inLineForFile` correctly reads as real — see tests/in-line-new-directory.test.mjs).
  const { out, code, err } = grain(['where', 'reporting/exporters/csvExporter.ts']);
  assert.equal(code, 0, `${out}\n${err}`);
  assert.match(out, /does not exist yet — nearest existing:/, out);
});

test('a bare word that merely contains a slash but names nothing in the tree is NOT routed as a path', () => {
  const { out, code, err } = grain(['where', 'async/await']);
  assert.equal(code, 0, `${out}\n${err}`);
  assert.doesNotMatch(out, /does not exist yet/, out);
});

test('an ordinary multi-word intent is unaffected by the routing check', () => {
  const { out, code, err } = grain(['where', 'todo item entity']);
  assert.equal(code, 0, `${out}\n${err}`);
  assert.match(out, /→ file src\/domain\/entities\/todoItem\.ts/, out);
});
