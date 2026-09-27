// Guard for the risk guardrail measurement in tests/stress/labels.mjs (research B7, issue 268): node features taken
// before a loop opened, against the nodes the loop's bug issues and the reviewer's refusals later named, by node kind.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { auc, isTestPath, residual, riskMeasure } from './stress/labels.mjs';
import { removeTemp } from './remove-temp.mjs';

test('AUC counts ties as half and is null without both classes', () => {
  assert.equal(auc([1, 2, 3, 4], [false, false, true, true]), 1);
  assert.equal(auc([4, 3, 2, 1], [false, false, true, true]), 0);
  assert.equal(auc([1, 1, 1, 1], [false, true, false, true]), 0.5);
  assert.equal(auc([1, 2], [true, true]), null);
});

test('the residual of y on x removes what a straight line in x explains', () => {
  const x = [1, 2, 3, 4, 5];
  const r = residual(x.map(v => 3 * v + 2), [x]);
  for (const v of r) assert.ok(Math.abs(v) < 1e-9);
  const r2 = residual([1, 0, 1, 0, 1], [x]);
  assert.ok(Math.abs(r2.reduce((a, b) => a + b, 0)) < 1e-9); // an intercept is always fitted
});

test('test nodes are told from production nodes by path', () => {
  for (const id of ['cli/tests/unit/x', 'src/__tests__', 'spec/models', 'pkg/a.test.ts', 'e2e']) assert.ok(isTestPath(id), id);
  for (const id of ['cli/core/check', 'src/testing-utils-free', 'contest/x']) assert.ok(!isTestPath(id), id);
});

let tmp, repo, jarl, env;
const w = (rel, content) => { const p = join(repo, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, content); };
const commit = (msg, date) => {
  const e = { ...env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  execFileSync('git', ['-C', repo, 'add', '-A'], { env: e });
  execFileSync('git', ['-C', repo, 'commit', '-q', '-m', msg], { env: e });
};
const node = (mapping, targets) => `name: n\ntype: module\nmapping:\n  - ${mapping}\nrelations:\n${targets.map(t => `  - target: ${t}\n    type: uses\n`).join('')}`;

before(() => {
  tmp = mkdtempSync(join(tmpdir(), 'labels-risk-'));
  repo = join(tmp, 'tool');
  jarl = join(tmp, '.jarl');
  env = { ...process.env, HOME: tmp, GIT_AUTHOR_NAME: 'T', GIT_AUTHOR_EMAIL: 't@x', GIT_COMMITTER_NAME: 'T', GIT_COMMITTER_EMAIL: 't@x' };
  mkdirSync(repo, { recursive: true });
  execFileSync('git', ['-C', repo, 'init', '-q', '-b', 'main'], { env });
  w('.yggdrasil/model/core/yg-node.yaml', node('src/core/', []));
  w('.yggdrasil/model/cli/yg-node.yaml', node('src/cli/', ['core']));
  w('.yggdrasil/model/io/yg-node.yaml', node('src/io/', ['core']));
  w('.yggdrasil/model/tests/yg-node.yaml', node('tests/', []));
  w('src/core/a.ts', 'a\nb\nc\nd\n'); w('src/cli/b.ts', 'a\n'); w('src/io/c.ts', 'a\nb\n'); w('tests/t.test.ts', 'a\n');
  commit('one', '2026-09-01T10:00:00Z');
  w('src/core/a.ts', 'a\nb\nc\nd\ne\n');
  commit('two', '2026-09-02T10:00:00Z');
  // after the loop opened: a new relation the cut must not see, and more lines the cut must not count
  w('.yggdrasil/model/tests/yg-node.yaml', node('tests/', ['core', 'cli', 'io']));
  w('src/cli/b.ts', 'a\nb\nc\nd\ne\nf\ng\nh\n');
  commit('three', '2026-09-20T10:00:00Z');
  mkdirSync(join(jarl, 'issues'), { recursive: true });
  writeFileSync(join(jarl, 'log.md'), '- 2026-09-10 09:00 · filed 001 · a defect\n');
  writeFileSync(join(jarl, 'issues', '001-x.md'), '# 001 · x\n\n**Kind:** bug\n**Files:** tool/src/core/a.ts, tool/CHANGELOG.md\n**Repo:** ../tool\n');
  w('.yggdrasil/yg-events.llm.jsonl', JSON.stringify({ ts: '2026-09-12T00:00:00Z', aspectId: 'r', unitKey: 'file:src/io/c.ts', kind: 'llm', disposition: 'refused', hash: 'h' }) + '\n');
});
after(() => { try { removeTemp(tmp); } catch { /* best effort */ } });

test('features come from before the loop opened; labels from the loop and the refusals after it', () => {
  const r = riskMeasure(repo, jarl);
  assert.equal(r.repo, 'tool');
  assert.equal(r.cutoff, '2026-09-10T09:00');
  assert.equal(r.leafNodes, 4);
  assert.equal(r.bugIssues, 1);
  const all = r.rows.all;
  assert.equal(all['bug issue'].positives, 1); // core, through src/core/a.ts
  assert.equal(all['refused after cut'].positives, 1); // io
  // core is the largest node at the cut (5 lines, 2 commits) and the only one with fan-in there: every size and
  // fan-in reading ranks it first; the relations added after the cut would have given the test node fan-in 0 still
  assert.equal(all['bug issue']['log LOC'], 1);
  assert.equal(all['bug issue']['fan-in'], 1);
  assert.equal(r.rows.production['bug issue'].nodes, 3);
  assert.equal(r.rows.test['bug issue'].positives, 0);
});
