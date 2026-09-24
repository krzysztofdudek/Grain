// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — lexical candidates through Module.nesting
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
/** Every candidate key of every symbol group, in order, one array per group. */
const groups = (uses) =>
  uses.map((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('a top-level reference stays a single verbatim candidate (cref is Object)', async () => {
  const { uses } = await run(['class OrderService < BaseService', '  include Loggable', 'end', 'x = Helper', ''].join('\n'));
  expect(groups(uses)).toEqual([['BaseService'], ['OrderService::Loggable', 'Loggable'], ['Helper']]);
});
