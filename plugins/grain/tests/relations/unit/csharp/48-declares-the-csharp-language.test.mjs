import { test } from 'node:test';
import { expect, extractorForLanguage } from '../_unit-harness.mjs';

test('declares the csharp language', () => {
  expect(extractorForLanguage('csharp').languages.has('csharp')).toBe(true);
});
