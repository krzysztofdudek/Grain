// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — registry wiring
import { test } from 'node:test';
import { expect, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');

test('declares the ruby language', () => {
  expect(rubyExtractor.languages.has('ruby')).toBe(true);
});
