import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cppExtractor = extractorForLanguage('cpp');
const run = (code, ext = '.cpp') => runExtractor(cppExtractor, 'cpp', ext, code);

test('reports the line of each include', async () => {
  const { uses } = await run('\n#include "X.hpp"\n');
  expect(uses[0]?.line).toBe(2);
});
