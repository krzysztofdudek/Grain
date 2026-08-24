import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);

test('carries a 1-based line number for each declaration', async () => {
  const { declarations } = await run('\nclass OnLineTwo {}\n');
  const foo = declarations.find((d) => d.symbolKey === 'OnLineTwo');
  expect(foo?.line).toBe(2);
});
