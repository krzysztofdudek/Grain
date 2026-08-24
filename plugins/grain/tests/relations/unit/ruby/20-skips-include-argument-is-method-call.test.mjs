// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — uses() emits SYMBOL hints (constants)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
const symbolKeys = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('SKIPS an `include` whose argument is a method call (non-constant → constantKey undefined)', async () => {
  // `include some_method` — the argument is an identifier/call, not a constant, so
  // constantKey returns undefined and nothing is emitted.
  const { uses } = await run('class C\n  include some_method\nend\n');
  expect(symbolKeys(uses)).toHaveLength(0);
});
