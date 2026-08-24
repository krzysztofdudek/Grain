import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cExtractor = extractorForLanguage('c');
const run = (code, ext = '.c') => runExtractor(cExtractor, 'c', ext, code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits nothing for an empty quoted include (#include "") — the bare "" yields no path', async () => {
  // The `path` string_literal has no string_content child; the fallback strips the
  // two quote chars to '' (c-cpp-shared text-length>=2 branch), which the emitter
  // discards (headerPath === '').
  const { uses } = await run('#include ""\n');
  expect(specs(uses)).toHaveLength(0);
});
