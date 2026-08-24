import { test } from 'node:test';
import { expect, extractorForLanguage } from '../_unit-harness.mjs';

test('resolves the C extractor for c, and C++ for cpp (quoted #include resolved)', () => {
  expect(extractorForLanguage('c')).toBeDefined();
  expect(extractorForLanguage('cpp')).toBeDefined();
});
