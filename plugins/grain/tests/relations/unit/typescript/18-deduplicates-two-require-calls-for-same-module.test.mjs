import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('deduplicates two require() calls for the same module on one line', async () => {
  const { uses } = await run(`const a = require('./a'); const b = require('./a');`);
  expect(
    uses.filter((u) => u.candidates[0].kind === 'path' && u.candidates[0].specifier === './a'),
  ).toHaveLength(1);
});
