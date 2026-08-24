// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — uses() emits PATH hints (require_relative)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
const pathSpecs = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('SKIPS a plain `require` of a gem (only require_relative is a path link)', async () => {
  const { uses } = await run("require 'json'\nrequire 'order/processor'\n");
  // Neither is a require_relative → no path hint at all.
  expect(pathSpecs(uses)).toHaveLength(0);
});
