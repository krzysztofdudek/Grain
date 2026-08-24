// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — declarations() build FQNs from nesting
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);

test('does NOT record a SCOPED constant assignment (`Foo::BAR = 1`) as a definition', async () => {
  // The `left` field is a scope_resolution, not a bare `constant`, so it is not indexed
  // as a node-defining declaration (only bare top-level constants are).
  const { declarations } = await run('Foo::BAR = 1\n');
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).not.toContain('Foo::BAR');
  expect(keys).toHaveLength(0);
});
