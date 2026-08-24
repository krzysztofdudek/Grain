// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — uses() emits SYMBOL hints (constants)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
const symbolKeys = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('emits NO use for a DYNAMIC superclass expression (e.g. `Struct.new(:x)`) — not a constant name', async () => {
  // A common real-world idiom: the superclass is a method-call RESULT, not a
  // constant-name node, so constantKey(expr) is undefined and the (unguarded)
  // emitSymbol call at the superclass site must no-op rather than emit a
  // hint keyed on 'undefined' or crash.
  const { uses } = await run('class C < Struct.new(:x)\nend\n');
  expect(symbolKeys(uses)).toHaveLength(0);
  expect(uses).toHaveLength(0);
});
