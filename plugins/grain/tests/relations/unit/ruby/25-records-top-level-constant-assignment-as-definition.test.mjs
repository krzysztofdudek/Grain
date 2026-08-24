// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — declarations() build FQNs from nesting
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);

test('records a top-level constant assignment as a definition', async () => {
  const { declarations } = await run('MAX = 5\nMyAlias = OriginalClass\n');
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('MAX');
  expect(keys).toContain('MyAlias');
});
