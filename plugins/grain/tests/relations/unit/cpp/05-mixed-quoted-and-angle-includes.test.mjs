import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cppExtractor = extractorForLanguage('cpp');
const run = (code, ext = '.cpp') => runExtractor(cppExtractor, 'cpp', ext, code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits only the quoted includes when quoted and angle are mixed', async () => {
  const { uses } = await run('#include <vector>\n#include "A.hpp"\n#include <string>\n#include "b/C.hpp"\n');
  const s = specs(uses);
  expect(s).toEqual(expect.arrayContaining(['A.hpp', 'b/C.hpp']));
  expect(s).toHaveLength(2);
});
