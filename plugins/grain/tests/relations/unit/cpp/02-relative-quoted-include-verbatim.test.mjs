import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cppExtractor = extractorForLanguage('cpp');
const run = (code, ext = '.cpp') => runExtractor(cppExtractor, 'cpp', ext, code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits a path hint for a relative quoted include verbatim', async () => {
  const { uses } = await run('#include "../util/Helper.hpp"\n');
  expect(specs(uses)).toEqual(['../util/Helper.hpp']);
});
