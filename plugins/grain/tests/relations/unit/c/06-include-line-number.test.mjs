import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cExtractor = extractorForLanguage('c');
const run = (code, ext = '.c') => runExtractor(cExtractor, 'c', ext, code);

test('reports the line of each include', async () => {
  const { uses } = await run('\n\n#include "x.h"\n');
  expect(uses[0]?.line).toBe(3);
});
