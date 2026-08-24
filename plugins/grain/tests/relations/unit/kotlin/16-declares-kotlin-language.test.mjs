// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin extractor — registry wiring')
import { test } from 'node:test';
import { expect, extractorForLanguage } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');

test('declares the kotlin language', () => {
  expect(kotlinExtractor.languages.has('kotlin')).toBe(true);
});
