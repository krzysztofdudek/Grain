// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — C1: bare constants inside a namespace are suppressed (zero-FP)
// (PAIRED POSITIVES: do NOT over-silence real cross-node references)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
const symbolKeys = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('SUPPRESSES a bare value-use constant inside a (top-level) class body', async () => {
  // A class IS a constant namespace in Ruby: a bare `Helper` inside `class Order`
  // lexically resolves to Order::Helper (if defined) or top-level Helper — never
  // reliably to a uniquely-defined top-level Helper in another node. Zero-FP.
  const { uses } = await run(['class Order', '  def run', '    Helper.go', '  end', 'end', ''].join('\n'));
  expect(symbolKeys(uses)).not.toContain('Helper');
});
