import { test } from 'node:test';
import { expect, extractorForLanguage } from '../_unit-harness.mjs';

test('resolves the Ruby extractor (require_relative path + constant symbol-table)', () => {
  expect(extractorForLanguage('ruby')).toBeDefined();
});
