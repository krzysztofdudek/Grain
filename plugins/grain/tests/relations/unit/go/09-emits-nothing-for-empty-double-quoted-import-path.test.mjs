import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('go'), 'go', '.go', code);

test('emits NOTHING for an empty double-quoted import path', async () => {
  // `import ""` strips to '' — the emit guard discards an empty specifier. No edge.
  const { uses } = await run('package main\nimport ""\n');
  expect(uses).toHaveLength(0);
});
