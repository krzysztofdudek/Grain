import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cExtractor = extractorForLanguage('c');
const run = (code, ext = '.c') => runExtractor(cExtractor, 'c', ext, code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('dedupes two identical includes that share the same source line', async () => {
  // Two `#include "a.h"` directives on ONE physical line collide on the dedup key
  // `<path> <line>` (same path, same line) → only the first is emitted (the
  // seen-set hit branch in c-cpp-shared).
  const { uses } = await run('#include "a.h" #include "a.h"\n');
  expect(specs(uses)).toEqual(['a.h']);
});
