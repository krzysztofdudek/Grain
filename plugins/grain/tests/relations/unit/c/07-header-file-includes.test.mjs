import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cExtractor = extractorForLanguage('c');
const run = (code, ext = '.c') => runExtractor(cExtractor, 'c', ext, code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('also extracts includes from a .h header (the .h grammar is C)', async () => {
  const { uses } = await run('#include "shared.h"\n', '.h');
  expect(specs(uses)).toEqual(['shared.h']);
});
