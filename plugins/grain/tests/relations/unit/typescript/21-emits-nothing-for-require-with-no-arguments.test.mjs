import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('emits nothing for a require with no arguments', async () => {
  // `require()` has an empty argument list → firstArgument is null → no edge.
  const { uses } = await run(`const x = require();`);
  expect(uses).toHaveLength(0);
});
