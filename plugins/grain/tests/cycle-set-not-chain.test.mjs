// G19: a strongly connected component is an unordered SET — every member can reach every other, possibly through
// intermediates — not a literal chain. moduleGraph() (relations.mjs) computes SCCs correctly via Tarjan but then
// stores each one alphabetically sorted (`cycles.push(comp.sort())`), discarding the real adjacency path found.
// report()/rulesMarkdown() (core.mjs) used to join that sorted array with `↔`, visually claiming every alphabetically
// adjacent pair is a real edge. Fixture below: a genuine 4-module SCC (real cycle mod-a→mod-c→mod-d→mod-b→mod-a)
// where the alphabetically adjacent pair (mod-b, mod-c) has NO edge in either direction — proving the old `↔` line
// asserted a false edge, not just an ugly one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moduleGraph } from '../engine/relations.mjs';
import { report, rulesMarkdown } from '../engine/core.mjs';

const files = ['mod-a/index.ts', 'mod-b/index.ts', 'mod-c/index.ts', 'mod-d/index.ts'];
// real cycle path: a→c→d→b→a. Alphabetically sorted the SCC is [mod-a, mod-b, mod-c, mod-d]; the sorted-adjacent
// pair (mod-b, mod-c) is never connected by any edge in this list, in either direction.
const edges = [
  { from: 'mod-a/index.ts', to: 'mod-c/index.ts', kind: 'import', line: 1, n: 1 },
  { from: 'mod-c/index.ts', to: 'mod-d/index.ts', kind: 'import', line: 1, n: 1 },
  { from: 'mod-d/index.ts', to: 'mod-b/index.ts', kind: 'import', line: 1, n: 1 },
  { from: 'mod-b/index.ts', to: 'mod-a/index.ts', kind: 'import', line: 1, n: 1 },
];
const baseModel = mg => ({ partitions: [], moduleGraph: mg, archNorms: [], cochange: [], boundaries: [], steers: [], agentShare: null, repo: 'fixture' });

test('the fixture graph is a genuine 4-member SCC with a sorted-adjacent pair that has no real edge', () => {
  const mg = moduleGraph(edges, files, []);
  assert.deepEqual(mg.cycles, [['mod-a', 'mod-b', 'mod-c', 'mod-d']], 'Tarjan must find one SCC of all four modules, alphabetically sorted');
  const connected = new Set(mg.edges.map(e => e.from + '|' + e.to));
  assert.ok(!connected.has('mod-b|mod-c') && !connected.has('mod-c|mod-b'), 'mod-b and mod-c must have NO edge in either direction — the false-adjacency case this bug produces');
});

test('report prints the cycle as a strongly-connected set, not a chain implying false edges', () => {
  const mg = moduleGraph(edges, files, []);
  const lines = report(baseModel(mg));
  const cycleLine = lines.find(l => l.trim().startsWith('cycle'));
  assert.ok(cycleLine, `no cycle line found: ${JSON.stringify(lines)}`);
  assert.equal(cycleLine, '  cycle (strongly connected): mod-a, mod-b, mod-c, mod-d — every member reaches every other, not necessarily in this order');
  assert.ok(!cycleLine.includes('↔'), 'must not use an arrow that implies adjacency');
});

test('rulesMarkdown prints the same cycle under a set-labeled heading, not a chain', () => {
  const mg = moduleGraph(edges, files, []);
  const lines = rulesMarkdown(baseModel(mg));
  const headingLine = lines.find(l => l.startsWith('**Cycles'));
  assert.ok(headingLine, `no cycles heading found: ${JSON.stringify(lines)}`);
  assert.equal(headingLine, '**Cycles (strongly connected — every member reaches every other, not necessarily in this order):**');
  const bulletLine = lines.find(l => l.startsWith('- mod-a'));
  assert.equal(bulletLine, '- mod-a, mod-b, mod-c, mod-d');
  assert.ok(!bulletLine.includes('↔'), 'must not use an arrow that implies adjacency');
});

test('regression: a module graph with zero cycles renders identically with no cycle text in report or rules', () => {
  const noCycleFiles = ['mod-x/index.ts', 'mod-y/index.ts', 'mod-z/index.ts'];
  const noCycleEdges = [
    { from: 'mod-x/index.ts', to: 'mod-y/index.ts', kind: 'import', line: 1, n: 1 },
    { from: 'mod-y/index.ts', to: 'mod-z/index.ts', kind: 'import', line: 1, n: 1 },
  ];
  const mg = moduleGraph(noCycleEdges, noCycleFiles, []);
  assert.deepEqual(mg.cycles, []);
  const reportLines = report(baseModel(mg));
  assert.ok(reportLines.some(l => l.includes('0 cycle(s)')), 'the count line must still say 0 cycle(s)');
  assert.ok(!reportLines.some(l => l.trim().startsWith('cycle')), 'no cycle line should be printed when there are no cycles');
  const rulesLines = rulesMarkdown(baseModel(mg));
  assert.ok(rulesLines.some(l => l.includes('0 cycle(s)')));
  assert.ok(!rulesLines.some(l => l.startsWith('**Cycles')), 'no Cycles heading should be printed when there are no cycles');
});
