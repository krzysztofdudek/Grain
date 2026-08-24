import { test } from 'node:test';
import { expect, extractorForLanguage } from '../_unit-harness.mjs';

test('seeds preserve current history', () => {
  expect(extractorForLanguage('java').rev).toBe(3);
  expect(extractorForLanguage('csharp').rev).toBe(2);
  expect(extractorForLanguage('typescript').rev).toBe(1);
});
