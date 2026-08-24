import { test } from 'node:test';
import { expect, extractorForLanguage } from '../_unit-harness.mjs';

test('every extractor declares an integer rev', () => {
  for (const lang of ['typescript', 'python', 'go', 'java', 'php', 'kotlin', 'rust', 'c', 'cpp', 'csharp', 'ruby']) {
    const e = extractorForLanguage(lang);
    expect(Number.isInteger(e.rev)).toBe(true);
  }
});
