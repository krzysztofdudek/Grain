// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — uses() emits PATH hints (require_relative)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);

test('carries a 1-based line number for the require_relative hint', async () => {
  const { uses } = await run("\n\nrequire_relative './helper'\n");
  const hint = uses.find((u) => u.candidates[0].kind === 'path');
  expect(hint?.line).toBe(3);
});
