import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cExtractor = extractorForLanguage('c');
const run = (code, ext = '.c') => runExtractor(cExtractor, 'c', ext, code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits an angle include as `<name>` (resolved only under a compile database -I root)', async () => {
  const { uses } = await run('#include <stdio.h>\n#include <stdlib.h>\n');
  expect(specs(uses)).toEqual(['<stdio.h>', '<stdlib.h>']);
});
