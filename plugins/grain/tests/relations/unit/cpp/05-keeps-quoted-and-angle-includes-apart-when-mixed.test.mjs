import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cppExtractor = extractorForLanguage('cpp');
const run = (code, ext = '.cpp') => runExtractor(cppExtractor, 'cpp', ext, code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('keeps quoted and angle includes apart when they are mixed', async () => {
  const { uses } = await run('#include <vector>\n#include "A.hpp"\n#include <string>\n#include "b/C.hpp"\n');
  expect(specs(uses)).toEqual(['<vector>', 'A.hpp', '<string>', 'b/C.hpp']);
});
