// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — declarations() build FQNs from nesting
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);

test('a REOPENED class produces TWO definitions of the same FQN (no dedupe)', async () => {
  const { declarations } = await run('class Foo\nend\nclass Foo\nend\n');
  const fooDefs = declarations.filter((d) => d.symbolKey === 'Foo');
  expect(fooDefs).toHaveLength(2);
  // Different lines — two distinct definition sites of the same constant.
  expect(new Set(fooDefs.map((d) => d.line)).size).toBe(2);
});
