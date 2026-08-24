import { test } from 'node:test';
import { expect, extractorForLanguage } from '../_unit-harness.mjs';

test('resolves the TypeScript extractor for ts/tsx/js', () => {
  expect(extractorForLanguage('typescript')).toBeDefined();
  expect(extractorForLanguage('tsx')).toBeDefined();
  expect(extractorForLanguage('javascript')).toBeDefined();
});
