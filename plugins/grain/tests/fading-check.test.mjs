// A fading convention stands `check` down (check.mjs: `if (sf === f && f.trend && f.trend.fading) continue`): once
// the code written since a certified change point no longer carries the expected value at the λ bound, new code
// that departs from it is not accused. This test goes through `checkFile` itself. The repository below fades
// WITHOUT nucleating, so the other stand-down (`suppressedValue`, a newer value reaching the bound) cannot be the
// reason for the silence: 80 classes decorated `@Handler`, two per commit over 40 commits, then 12 commits of one
// class each, 7 without the decorator and 5 with it, alternating. The fact stands (85 of 92), the cut falls after
// the 40th commit, and after it `true` is at (5 + ½) / (12 + 1) and `false` at (7 + ½) / (12 + 1), both under 7/8.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFile } from '../engine/core.mjs';

const BIN = join(dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'grain.mjs');
const T0 = new Date('2026-01-01T12:00:00Z');
const day = n => new Date(T0.getTime() + n * 86400000).toISOString().slice(0, 10);
let tmp, repo;
const git = (iso, ...a) =>
  execFileSync('git', ['-C', repo, ...a], {
    encoding: 'utf8',
    env: { ...process.env, GIT_AUTHOR_NAME: 'Dev', GIT_AUTHOR_EMAIL: 'dev@x', GIT_COMMITTER_NAME: 'Dev', GIT_COMMITTER_EMAIL: 'dev@x', TZ: 'UTC', GIT_AUTHOR_DATE: `${iso}T12:00:00Z`, GIT_COMMITTER_DATE: `${iso}T12:00:00Z` },
  });
const w = (rel, content) => { mkdirSync(join(repo, dirname(rel)), { recursive: true }); writeFileSync(join(repo, rel), content); };
const commit = (iso, msg) => { git(iso, 'add', '-A'); git(iso, 'commit', '-qm', msg); };
const decorated = i => `@Handler\nexport class H${i} { run() { return ${i}; } }\n`;
const plain = i => `export class H${i} { run() { return ${i}; } }\n`;
const PID = 'auto.deco:@Handler';

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'grain-fading-'));
  repo = join(tmp, 'r');
  mkdirSync(repo);
  git(day(0), 'init', '-q', '-b', 'main');
  git(day(0), 'config', 'commit.gpgsign', 'false');
  let i = 0;
  for (let c = 0; c < 40; c++) {
    w(`src/handlers/H${i}.ts`, decorated(i)); i++;
    w(`src/handlers/H${i}.ts`, decorated(i)); i++;
    commit(day(c), `feat: handlers ${i - 2} and ${i - 1}`);
  }
  for (let c = 0; c < 12; c++) {
    w(`src/handlers/H${i}.ts`, c % 2 === 0 || c === 11 ? plain(i) : decorated(i));
    commit(day(40 + c), `feat: handler ${i}`);
    i++;
  }
  w('NOTES.md', 'notes\n');
  commit(day(90), 'chore: notes');
  const r = spawnSync('node', [BIN, 'status'], { cwd: repo, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
after(() => { if (tmp) rmSync(tmp, { recursive: true, force: true }); });

const model = () => JSON.parse(readFileSync(join(repo, '.grain', 'cache', 'model.json'), 'utf8'));
const handlerFact = m => {
  const fs2 = m.partitions.flatMap(p => p.facts).filter(f => f.pid === PID);
  assert.equal(fs2.length, 1, `one @Handler fact expected, got ${fs2.length}`);
  return fs2[0];
};
const accused = async m => {
  const r = await checkFile({ model: m, root: repo, rel: 'src/handlers/HNew.ts', content: plain('New') });
  return r.msgs.filter(x => JSON.stringify(x).includes('@Handler'));
};

test('the fixture fades without nucleating', () => {
  const f = handlerFact(model());
  assert.equal(f.exp, 'true');
  assert.ok(f.trend && f.trend.fading === true, `expected a fading trend: ${JSON.stringify(f.trend)}`);
  assert.equal(f.trend.nucleating ?? null, null, `no value may nucleate here: ${JSON.stringify(f.trend)}`);
  assert.equal(f.suppressedValue ?? null, null, 'the nucleation stand-down must not be what silences check');
});

test('checkFile does not accuse new code under a fading convention, and does once the fading flag is cleared', async () => {
  const m = model();
  assert.deepEqual(await accused(m), [], 'a fading convention must not accuse new code');
  const f = handlerFact(m);
  f.trend = { ...f.trend, fading: false };
  const msgs = await accused(m);
  assert.ok(msgs.length > 0, 'the same file IS accused when the convention is not fading — the stand-down is the reason');
});
