// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — declarations() build FQNs from nesting
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);

test('qualifies a constant assignment NESTED in a module into a FQN (M::X)', async () => {
  // `X = 1` inside `module M` is reached via generic descent under the module body
  // with a non-empty nsStack, so it gets the FQN prefix.
  const { declarations } = await run('module M\n  X = 1\nend\n');
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('M');
  expect(keys).toContain('M::X');
});
