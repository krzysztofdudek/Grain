// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — uses() emits SYMBOL hints (constants)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
const symbolKeys = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('emits a scope_resolution superclass key, stripping a leading `::`', async () => {
  const { uses } = await run('class A < Reporting::Base\nend\nclass B < ::Top::Base\nend\n');
  const keys = symbolKeys(uses);
  expect(keys).toContain('Reporting::Base');
  expect(keys).toContain('Top::Base'); // leading `::` stripped
  expect(keys.every((k) => !k.startsWith('::'))).toBe(true);
});
