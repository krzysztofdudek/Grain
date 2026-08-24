// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — declarations() build FQNs from nesting
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);

test('carries 1-based line numbers', async () => {
  const { declarations } = await run('\nclass Foo\nend\n');
  expect(declarations.find((d) => d.symbolKey === 'Foo')?.line).toBe(2);
});
