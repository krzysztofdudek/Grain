import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cppExtractor = extractorForLanguage('cpp');
const run = (code, ext = '.cpp') => runExtractor(cppExtractor, 'cpp', ext, code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits an angle include as `<name>` (resolved only under a compile database -I root)', async () => {
  const { uses } = await run('#include <vector>\n#include <memory>\n');
  expect(specs(uses)).toEqual(['<vector>', '<memory>']);
});
