import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cExtractor = extractorForLanguage('c');
const run = (code, ext = '.c') => runExtractor(cExtractor, 'c', ext, code);

test('emits a path hint for a quoted #include (the header path text, no quotes)', async () => {
  const { uses } = await run('#include "db/connection.h"\n');
  expect(uses).toContainEqual(
    expect.objectContaining({
      candidates: [{ kind: 'path', specifier: 'db/connection.h' }],
      kind: 'import',
    }),
  );
});
