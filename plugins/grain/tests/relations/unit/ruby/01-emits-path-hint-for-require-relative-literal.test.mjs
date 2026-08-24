// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — uses() emits PATH hints (require_relative)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);

test('emits a path hint with the literal string for require_relative', async () => {
  const { uses } = await run("require_relative '../services/order_service'\n");
  expect(uses).toContainEqual(
    expect.objectContaining({
      candidates: [{ kind: 'path', specifier: '../services/order_service' }],
      kind: 'import',
    }),
  );
});
