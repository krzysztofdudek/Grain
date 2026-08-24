import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cppExtractor = extractorForLanguage('cpp');
const run = (code, ext = '.cpp') => runExtractor(cppExtractor, 'cpp', ext, code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('does NOT emit a hint for a macro include (#include MYHDR — no literal path)', async () => {
  const { uses } = await run('#include MYHDR\n');
  expect(specs(uses)).toHaveLength(0);
});
