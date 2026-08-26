// The language bridge (grain-authored): every commit is a translation pair — natural language in the message, code in
// the touched files. `where` consults it ONLY for query words no code card carries, and always cites the evidence
// (files, counts, an example commit). Never a global dictionary: a repo whose history never says the word stays silent.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
const env = i => ({ ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: `2026-01-${String(10 + i).padStart(2, '0')}T12:00:00Z`, GIT_COMMITTER_DATE: `2026-01-${String(10 + i).padStart(2, '0')}T12:00:00Z` });
const git = (i, ...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env: env(i) });
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-aff-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git(0, 'init', '-q', '-b', 'main'); git(0, 'config', 'commit.gpgsign', 'false');
  w('src/health/controller.ts', 'export class HealthController { probe() { return 1; } }\n');
  w('src/other/util.ts', 'export const util = () => 1;\n');
  git(0, 'add', '-A'); git(0, 'commit', '-qm', 'base');
  // the word "endpoint" lives ONLY in commit messages, never in the code
  w('src/health/controller.ts', 'export class HealthController { probe() { return 1; }\n  live() { return 2; } }\n');
  git(1, 'add', '-A'); git(1, 'commit', '-qm', 'add health endpoint liveness probe');
  w('src/health/controller.ts', 'export class HealthController { probe() { return 1; }\n  live() { return 3; } }\n');
  git(2, 'add', '-A'); git(2, 'commit', '-qm', 'fix health endpoint response code');
  const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' }); assert.equal(st.status, 0, st.stderr);
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('a query word the code never says is translated by the commits that say it, with citations', () => {
  const r = spawnSync('node', [BIN, 'where', 'endpoint', 'liveness'], { cwd: repo, encoding: 'utf8' });
  assert.match(r.stdout, /history bridge: «endpoint» appears in no code card here, but commits saying it touched: `src\/health\/controller\.ts` \(2\)/);
  assert.match(r.stdout, /e\.g\. "add health endpoint liveness probe" \([0-9a-f]{7}\)/);
});

test('a word the history never says draws no bridge — silence, not a guess', () => {
  const r = spawnSync('node', [BIN, 'where', 'billing', 'invoice'], { cwd: repo, encoding: 'utf8' });
  assert.doesNotMatch(r.stdout, /history bridge/);
});
