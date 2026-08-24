import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('go'), 'go', '.go', code);

test('reports the line of each import', async () => {
  const { uses } = await run('package main\n\nimport "fmt"\n');
  expect(uses[0]?.line).toBe(3);
});
