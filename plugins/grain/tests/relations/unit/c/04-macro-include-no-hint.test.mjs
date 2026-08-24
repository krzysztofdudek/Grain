import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cExtractor = extractorForLanguage('c');
const run = (code, ext = '.c') => runExtractor(cExtractor, 'c', ext, code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('does NOT emit a hint for a macro include (#include HDR — no literal path)', async () => {
  const { uses } = await run('#include HDR\n');
  expect(specs(uses)).toHaveLength(0);
});
