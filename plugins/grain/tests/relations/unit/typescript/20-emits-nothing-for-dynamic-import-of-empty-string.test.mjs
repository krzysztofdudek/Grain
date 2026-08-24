import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('emits nothing for a dynamic import of the empty string literal', async () => {
  // `import('')` yields an empty specifier (the string node has no string_fragment);
  // the emit guard drops the empty / non-relative specifier.
  const { uses } = await run(`const d = import('');`);
  expect(uses).toHaveLength(0);
});
