import { test } from 'node:test';
import { expect, extractorForLanguage } from '../_unit-harness.mjs';

test('seeds preserve current history', () => {
  expect(extractorForLanguage('java').rev).toBe(3);
  expect(extractorForLanguage('csharp').rev).toBe(3);
  expect(extractorForLanguage('typescript').rev).toBe(3); // 3: every type-only reference and a module augmentation give an edge; 2: bare specifiers, new URL(), ERROR-region recovery
});
