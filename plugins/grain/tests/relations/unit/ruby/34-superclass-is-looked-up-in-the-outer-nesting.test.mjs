// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — lexical candidates through Module.nesting
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
/** Every candidate key of every symbol group, in order, one array per group. */
const groups = (uses) =>
  uses.map((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('a superclass is looked up in the OUTER nesting (the scope holding `class`)', async () => {
  const { uses } = await run(['module App', '  class Widget < Base', '  end', 'end', ''].join('\n'));
  expect(groups(uses)).toEqual([['App::Base', 'Base']]);
});
