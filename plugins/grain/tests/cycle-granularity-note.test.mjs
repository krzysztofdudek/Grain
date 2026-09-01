// §038: a reported architecture cycle is one of the strongest claims grain makes, but a "module" here is a
// directory bucket (moduleOf/refineModOf, relations.mjs) — not a build-declared source set. A directory holding
// more than one source set (Kotlin Multiplatform's commonMain/jvmMain/jvmTest under one src/, `src/main` +
// `src/test` under one module root, …) folds them into a single node, so a cycle whose edges all come from a test
// source set reads exactly like a production-code cycle. CYCLE_GRANULARITY_NOTE (core.mjs) discloses the
// granularity at the point the claim is made, so a reader can judge it themselves — deliberately fired on every
// cycle report (not only test-shaped ones), since selecting on shape would need the name-based test detection
// config.mjs's DESIGN RULING ("kod to kod") rejects. This is the disclosure, not a fix to module granularity
// itself (options 1/2 in the issue are explicitly out of scope for this ticket).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleGraph } from '../engine/relations.mjs';
import { report, rulesMarkdown, CYCLE_GRANULARITY_NOTE } from '../engine/core.mjs';

const baseModel = mg => ({ partitions: [], moduleGraph: mg, archNorms: [], cochange: [], boundaries: [], steers: [], agentShare: null, repo: 'fixture' });

// a genuine 4-module cycle (same shape as cycle-set-not-chain.test.mjs's fixture) — standing in for a real
// production-code SCC, unrelated to any test/production split.
const cycleFiles = ['mod-a/index.ts', 'mod-b/index.ts', 'mod-c/index.ts', 'mod-d/index.ts'];
const cycleEdges = [
  { from: 'mod-a/index.ts', to: 'mod-c/index.ts', kind: 'import', line: 1, n: 1 },
  { from: 'mod-c/index.ts', to: 'mod-d/index.ts', kind: 'import', line: 1, n: 1 },
  { from: 'mod-d/index.ts', to: 'mod-b/index.ts', kind: 'import', line: 1, n: 1 },
  { from: 'mod-b/index.ts', to: 'mod-a/index.ts', kind: 'import', line: 1, n: 1 },
];

test('report: a genuine module cycle is still reported, and now carries the granularity note', () => {
  const mg = moduleGraph(cycleEdges, cycleFiles, []);
  const lines = report(baseModel(mg));
  const cycleLine = lines.find(l => l.trim().startsWith('cycle'));
  assert.ok(cycleLine, `no cycle line found: ${JSON.stringify(lines)}`);
  assert.equal(cycleLine, '  cycle (strongly connected): mod-a, mod-b, mod-c, mod-d — every member reaches every other, not necessarily in this order');
  const noteLine = lines.find(l => l.includes(CYCLE_GRANULARITY_NOTE));
  assert.ok(noteLine, `granularity note not found in report() output: ${JSON.stringify(lines)}`);
});

test('rulesMarkdown: the same cycle carries the same granularity note', () => {
  const mg = moduleGraph(cycleEdges, cycleFiles, []);
  const lines = rulesMarkdown(baseModel(mg));
  const bulletLine = lines.find(l => l.startsWith('- mod-a'));
  assert.equal(bulletLine, '- mod-a, mod-b, mod-c, mod-d');
  const noteLine = lines.find(l => l === CYCLE_GRANULARITY_NOTE);
  assert.ok(noteLine, `granularity note not found in rulesMarkdown() output: ${JSON.stringify(lines)}`);
});

test('report and rulesMarkdown agree: both carry the exact same note text for the same cycle', () => {
  const mg = moduleGraph(cycleEdges, cycleFiles, []);
  const reportLines = report(baseModel(mg));
  const rulesLines = rulesMarkdown(baseModel(mg));
  assert.ok(reportLines.some(l => l.includes(CYCLE_GRANULARITY_NOTE)));
  assert.ok(rulesLines.some(l => l.includes(CYCLE_GRANULARITY_NOTE)));
});

test('a repo with no cycle gets no granularity note — it must not decorate unconditional architecture output', () => {
  const noCycleFiles = ['mod-x/index.ts', 'mod-y/index.ts', 'mod-z/index.ts'];
  const noCycleEdges = [
    { from: 'mod-x/index.ts', to: 'mod-y/index.ts', kind: 'import', line: 1, n: 1 },
    { from: 'mod-y/index.ts', to: 'mod-z/index.ts', kind: 'import', line: 1, n: 1 },
  ];
  const mg = moduleGraph(noCycleEdges, noCycleFiles, []);
  assert.deepEqual(mg.cycles, []);
  const reportLines = report(baseModel(mg));
  assert.ok(!reportLines.some(l => l.includes(CYCLE_GRANULARITY_NOTE)), 'no cycle → no granularity note in report()');
  const rulesLines = rulesMarkdown(baseModel(mg));
  assert.ok(!rulesLines.some(l => l.includes(CYCLE_GRANULARITY_NOTE)), 'no cycle → no granularity note in rulesMarkdown()');
});
