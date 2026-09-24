// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — lexical candidates through Module.nesting
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
/** Every candidate key of every symbol group, in order, one array per group. */
const groups = (uses) =>
  uses.map((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('an unrooted `A::B` inside a namespace gets nesting candidates anchored at `N::A`', async () => {
  const { uses } = await run(['module Shop', '  class Cart', '    Billing::Invoice.new', '  end', 'end', ''].join('\n'));
  expect(groups(uses)).toEqual([['Shop::Cart::Billing::Invoice', 'Shop::Billing::Invoice', 'Billing::Invoice']]);
  const anchors = uses[0].candidates.map((c) => (c.kind === 'symbol' ? c.rubyAnchor : undefined));
  expect(anchors).toEqual(['Shop::Cart::Billing', 'Shop::Billing', undefined]);
});
