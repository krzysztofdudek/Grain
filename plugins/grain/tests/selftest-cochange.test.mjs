// `grain selftest --cochange` — the co-change partners measured the way they are used (issue 366): learned from the
// oldest 80% of the retained footprints, scored on the newest 20%, and counted under the curveball null. These tests
// pin the protocol on synthetic footprints (a real pair must be found, noise must not be named, the model must never
// see the commits it is scored on) and the command's shape on a small real repository.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cochangeEval } from '../engine/selftest-cochange.mjs';
import { rng } from '../engine/selftest-null.mjs';

// 400 commits: `src/a.ts` and `test/a.test.ts` always travel together; the other commits touch one or two of 40
// noise files at random. The pair is real; nothing else is.
function history({ pairFromCommit = 0 } = {}) {
  const r = rng(11);
  const fps = [];
  for (let c = 0; c < 400; c++) {
    const files = new Set();
    if (c % 4 === 0 && c >= pairFromCommit) files.add('src/a.ts').add('test/a.test.ts');
    const k = 1 + Math.floor(r() * 2);
    while (files.size < k + (c % 4 === 0 && c >= pairFromCommit ? 2 : 0)) files.add(`noise/n${Math.floor(r() * 40)}.ts`);
    const fs2 = [...files].sort();
    fps.push({ sha: 's' + c, ts: c, toks: [], files: fs2, added: [], scopes: [], renames: [] });
  }
  return { fps };
}

test('a pair that always changes together is named and hit on the newer commits; the null names nothing', () => {
  const res = cochangeEval({ H: history(), runs: 2 });
  assert.equal(res.footprints, 400);
  assert.equal(res.train, 320);
  const c = res.arms.cell;
  assert.ok(c.hit3 > 0, `the real pair must be hit prospectively: ${JSON.stringify(c)}`);
  assert.ok(c.precision1 > 0.5, `what is named first is mostly right: ${JSON.stringify(c)}`);
  assert.ok(c.real >= 2, 'both directions of the pair are named over the whole history');
  assert.equal(c.null.length, 2, 'one null count per run');
  assert.ok(c.nullMean <= 1, `the null names at most one partner a run: ${c.null}`);
  assert.ok(res.arms.hottest, 'the hottest-files null is reported beside the cell');
});

test('the model is learned from the older commits only: a pair that appears only in the newest fifth is never named', () => {
  const res = cochangeEval({ H: history({ pairFromCommit: 330 }), runs: 1 });
  assert.equal(res.arms.cell.hit3, 0, 'a partner learned from the scored commits themselves would be a leak');
});

test('without history there is nothing to score', () => {
  const res = cochangeEval({ H: null, runs: 1 });
  assert.equal(res.footprints, 0);
  assert.equal(res.cases, 0);
});

// ===== the command, on a small real repository =====
const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
let tmp, repo;
before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-cochange-'));
  repo = join(tmp, 'r');
  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(join(repo, 'test'), { recursive: true });
  const env = { ...process.env, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' };
  const git = (...a) => execFileSync('git', ['-C', repo, ...a], { env: { ...env, GIT_AUTHOR_DATE: '2026-01-10T12:00:00Z', GIT_COMMITTER_DATE: '2026-01-10T12:00:00Z' } });
  git('init', '-q', '-b', 'main');
  for (let i = 0; i < 12; i++) {
    writeFileSync(join(repo, 'src', 'a.ts'), `export function run(x: string): string {\n  return x + '${i}';\n}\n`);
    writeFileSync(join(repo, 'test', 'a.test.ts'), `import { run } from '../src/a';\nrun('${i}');\n`);
    writeFileSync(join(repo, 'src', `m${i}.ts`), `export const m${i} = ${i};\n`);
    git('add', '-A');
    git('commit', '-qm', `change ${i}`);
  }
});
after(() => { rmSync(tmp, { recursive: true, force: true }); });

test('`grain selftest --cochange --json` reports each arm and one null count per run', () => {
  const r = spawnSync('node', [BIN, 'selftest', '--cochange', '--runs', '2', '--json'], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
  assert.equal(j.runs, 2);
  assert.equal(j.footprints, 12);
  for (const a of ['cell', 'hottest']) for (const k of ['hit3', 'nonObviousHit3', 'precision1', 'named']) assert.ok(k in j.arms[a], `${a}.${k}`);
  assert.equal(j.arms.cell.null.length, 2);
  assert.equal(typeof j.arms.cell.real, 'number');
});

test('`grain selftest --cochange` text names the protocol, both arms and the null', () => {
  const r = spawnSync('node', [BIN, 'selftest', '--cochange', '--runs', '1'], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^selftest --cochange \(12 commits: learned from the oldest 9, scored on \d+ files of the newer commits\)$/m);
  assert.match(r.stdout, /^ {2}co-change partners: hit@3 /m);
  assert.match(r.stdout, /^ {2}the 3 hottest files: hit@3 /m);
  assert.match(r.stdout, /^ {2}partners named over the whole history: \d+ · under the null, mean per run: /m);
});
