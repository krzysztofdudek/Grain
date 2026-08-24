import { test } from 'node:test';
import { expect, extractorForLanguage } from '../_unit-harness.mjs';

test('returns undefined for an unknown language (data grammars too)', () => {
  expect(extractorForLanguage('json')).toBeUndefined();
  expect(extractorForLanguage('yaml')).toBeUndefined();
});
