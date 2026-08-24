import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cExtractor = extractorForLanguage('c');
const run = (code, ext = '.c') => runExtractor(cExtractor, 'c', ext, code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits only the quoted includes when quoted and angle are mixed', async () => {
  const { uses } = await run('#include <stdio.h>\n#include "a.h"\n#include <string.h>\n#include "b/c.h"\n');
  const s = specs(uses);
  expect(s).toEqual(expect.arrayContaining(['a.h', 'b/c.h']));
  expect(s).toHaveLength(2);
});
