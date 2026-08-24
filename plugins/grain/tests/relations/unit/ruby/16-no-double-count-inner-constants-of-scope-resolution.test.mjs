// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — uses() emits SYMBOL hints (constants)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
const symbolKeys = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('does NOT double-count the inner constants of a scope_resolution', async () => {
  const { uses } = await run('x = A::B::C\n');
  const keys = symbolKeys(uses);
  expect(keys).toContain('A::B::C');
  // The qualifier segments A and A::B must NOT each surface as their own hint.
  expect(keys).not.toContain('A');
  expect(keys).not.toContain('A::B');
  expect(keys.filter((k) => k === 'A::B::C')).toHaveLength(1);
});
