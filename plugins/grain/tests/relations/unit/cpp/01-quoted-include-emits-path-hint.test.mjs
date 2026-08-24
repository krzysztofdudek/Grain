import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cppExtractor = extractorForLanguage('cpp');
const run = (code, ext = '.cpp') => runExtractor(cppExtractor, 'cpp', ext, code);

test('emits a path hint for a quoted #include (the header path text, no quotes)', async () => {
  const { uses } = await run('#include "orders/Order.hpp"\n');
  expect(uses).toContainEqual(
    expect.objectContaining({
      candidates: [{ kind: 'path', specifier: 'orders/Order.hpp' }],
      kind: 'import',
    }),
  );
});
