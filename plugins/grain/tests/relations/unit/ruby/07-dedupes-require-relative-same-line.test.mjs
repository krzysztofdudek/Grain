// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — uses() emits PATH hints (require_relative)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
const pathSpecs = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('DEDUPES two identical require_relative on the SAME line (path symbol+line key)', async () => {
  // `require_relative 'a'; require_relative 'a'` — same specifier, same line → one hint.
  const { uses } = await run("require_relative 'a'; require_relative 'a'\n");
  expect(pathSpecs(uses).filter((s) => s === 'a')).toHaveLength(1);
});
