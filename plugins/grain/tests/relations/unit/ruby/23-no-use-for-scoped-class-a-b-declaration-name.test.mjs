// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — uses() emits SYMBOL hints (constants)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
const symbolKeys = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('does NOT emit the scoped `name` of a `class A::B` declaration as a use', async () => {
  // The class name is a scope_resolution (`A::B`); it is the name field, so skipped
  // as a use while still recorded as a definition.
  const { uses, declarations } = await run('class A::B\nend\n');
  expect(symbolKeys(uses)).toHaveLength(0);
  expect(declarations.map((d) => d.symbolKey)).toContain('A::B');
});
