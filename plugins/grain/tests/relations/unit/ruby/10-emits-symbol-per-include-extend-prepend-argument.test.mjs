// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — uses() emits SYMBOL hints (constants)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
const symbolKeys = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('emits a symbol per `include` / `extend` / `prepend` module argument', async () => {
  const { uses } = await run(
    ['class C', '  include Loggable', '  extend Forwardable', '  prepend Tracing::Hook', 'end', ''].join('\n'),
  );
  const keys = symbolKeys(uses);
  expect(keys).toContain('Loggable');
  expect(keys).toContain('Forwardable');
  expect(keys).toContain('Tracing::Hook');
});
