// J7.1: `check --range <a>..<b> --json` (no file argument) is the SAME code path as `review --json` — both
// dispatch to cmdReview (grain.mjs, `case 'check': ... args.length === 0`). This file covers ONLY that one
// aggregate shape (shape 1 of the five this ticket touches) — a frozen key-list snapshot plus the `schema` marker.
// The other four shapes (cmdCheck's noGrammar/noPartition/parseFailed/full-verdict) are covered by the existing
// check-json-contract.test.mjs (G7/G8) — deliberately not duplicated here.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo, a, b;
const dateEnv = { GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z', GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z' };
const git = (...a2) => execFileSync('git', ['-C', repo, ...a2], { encoding: 'utf8', env: { ...process.env, ...dateEnv } }).trim();
const grain = args => { const r = spawnSync('node', [BIN, ...args], { cwd: repo, encoding: 'utf8' }); return { out: (r.stdout || '').replace(/\n$/, ''), err: r.stderr, code: r.status }; };

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-checkrange-'));
  repo = join(tmp, 'r'); mkdirSync(repo);
  git('init', '-q', '-b', 'main'); git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'a.ts'), 'export const a = 1;\n');
  git('add', '-A'); git('commit', '-qm', 'init'); a = git('rev-parse', 'HEAD');
  writeFileSync(join(repo, 'a.ts'), 'export const a = 2;\n');
  git('commit', '-qam', 'edit a'); b = git('rev-parse', 'HEAD');
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

// snapshot: any new top-level key added to this shape must be a deliberate decision reflected here, not a silent drift
const FROZEN_KEYS = ['asOf', 'cochangePartners', 'files', 'findings', 'missing', 'schema'];

test('check --range <a>..<b> --json (no file argument): top-level key list is frozen', () => {
  const { out, code, err } = grain(['check', '--range', `${a}..${b}`, '--json']);
  assert.equal(code, 0, err);
  const j = JSON.parse(out);
  assert.deepEqual(Object.keys(j).sort(), FROZEN_KEYS, `unexpected top-level shape: ${JSON.stringify(j)}`);
});

test('check --range <a>..<b> --json carries schema: "grain-check/1"', () => {
  const j = JSON.parse(grain(['check', '--range', `${a}..${b}`, '--json']).out);
  assert.equal(j.schema, 'grain-check/1');
});

test('review --range <a>..<b> --json is byte-identical to check --range <a>..<b> --json (same code path, same schema)', () => {
  const rc = grain(['review', '--range', `${a}..${b}`, '--json']);
  const cc = grain(['check', '--range', `${a}..${b}`, '--json']);
  assert.equal(cc.out, rc.out);
});
