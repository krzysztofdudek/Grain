import { test } from 'node:test';
import { expect, extractorForLanguage } from '../_unit-harness.mjs';

test('resolves the Kotlin extractor (symbol-table resolved)', () => {
  expect(extractorForLanguage('kotlin')).toBeDefined();
});
