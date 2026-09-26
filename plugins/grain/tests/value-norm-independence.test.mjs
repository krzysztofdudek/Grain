// Issue 260: a value container's co-travel norm is contrasted with INDEPENDENCE of its members given their own
// shares among the files that declare the container, not with a 50/50 coin. Members that every declaring file
// carries (a schema's required keys) are complete by the marginals alone and certify nothing; members that are each
// optional but travel together still do (kin-completeness.test.mjs carries that positive fixture).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { completeUnderIndependence } from '../engine/learn.mjs';

const fm = rows => new Map(rows.map((keys, i) => [`f${i}`, new Set(keys)]));

test('the independence rate by hand: Π p_j over the Poisson-binomial tail', () => {
  // three members each carried by 3 of 4 declaring files: 0.75³ / (0.75³ + 3·0.75²·0.25) = 0.5
  const q = completeUnderIndependence(['a', 'b', 'c'], fm([['a', 'b', 'c'], ['a', 'b', 'c'], ['a', 'b'], ['c']]), 2);
  assert.ok(Math.abs(q - 0.5) < 1e-12, String(q));
  // two members, one in every file, the other in half: complete given at least one = 0.5 exactly
  assert.ok(Math.abs(completeUnderIndependence(['a', 'b'], fm([['a', 'b'], ['a'], ['a', 'b'], ['a']]), 1) - 0.5) < 1e-12);
  // every member everywhere: independence already predicts completeness
  assert.equal(completeUnderIndependence(['a', 'b'], fm([['a', 'b'], ['a', 'b'], ['a', 'b']]), 1), 1);
});

test('schema furniture: a set every declaring file carries in full certifies no norm', () => {
  const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
  const tmp = mkdtempSync(join(tmpdir(), 'grain-valnull-'));
  try {
    const repo = join(tmp, 'r');
    mkdirSync(join(repo, 'src'), { recursive: true });
    const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x', GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' };
    const git = (...a) => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', env });
    git('init', '-q', '-b', 'main');
    git('config', 'commit.gpgsign', 'false');
    const reader = i => `export class Status${i}Reader {\n  readStatus(id: number): UserStatus {\n    return this.store.lookup(id);\n  }\n}\n`;
    for (let i = 1; i <= 5; i++) writeFileSync(join(repo, `src/s${i}.ts`), `export enum UserStatus { ACTIVE, SUSPENDED, PENDING }\n` + reader(i));
    for (let i = 1; i <= 16; i++) writeFileSync(join(repo, `src/filler${i}.ts`), `export class Filler${i}Service {\n  loadRecord(id: number): Record {\n    return this.store.fetch(id);\n  }\n}\n`);
    git('add', '-A');
    git('commit', '-qm', 'the value fixture');
    const st = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' });
    assert.equal(st.status, 0, st.stdout + st.stderr);
    const m = JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));
    assert.equal(Object.keys(m.valueSiblings).length, 1, 'the container is a candidate');
    assert.deepEqual(m.valueNorms, {}, 'five identical declarations are complete by the marginals alone; the 50/50 coin certified them');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
