// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — uses() emits SYMBOL hints (constants)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
const symbolKeys = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('a `class C` with NO superclass emits NO use (only its own definition)', async () => {
  // The `superclass` field is null → the superclass branch is skipped entirely.
  const { uses } = await run('class Foo\nend\n');
  expect(symbolKeys(uses)).toHaveLength(0);
  expect(uses).toHaveLength(0);
});
