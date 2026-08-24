// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — uses() emits SYMBOL hints (constants)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
const symbolKeys = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('DEDUPES the same constant referenced twice on ONE line (symbol+line key)', async () => {
  // `x = Helper; y = Helper` references `Helper` twice on the same line. The
  // emit dedup key is symbol+line, so the second occurrence is suppressed.
  const { uses } = await run('x = Helper; y = Helper\n');
  const helpers = symbolKeys(uses).filter((k) => k === 'Helper');
  expect(helpers).toHaveLength(1);
});
