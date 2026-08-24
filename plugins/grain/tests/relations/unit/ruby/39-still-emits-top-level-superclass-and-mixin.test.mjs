// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — C1: bare constants inside a namespace are suppressed (zero-FP)
// (PAIRED POSITIVES: do NOT over-silence real cross-node references)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
const symbolKeys = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('STILL emits a top-level superclass and a top-level mixin (depth 0)', async () => {
  const { uses } = await run(['class OrderService < BaseService', '  include Loggable', 'end', ''].join('\n'));
  const keys = symbolKeys(uses);
  expect(keys).toContain('BaseService');
  expect(keys).toContain('Loggable');
});
