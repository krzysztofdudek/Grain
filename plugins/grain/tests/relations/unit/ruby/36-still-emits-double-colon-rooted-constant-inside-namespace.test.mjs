// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — C1: bare constants inside a namespace are suppressed (zero-FP)
// (PAIRED POSITIVES: do NOT over-silence real cross-node references)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
const symbolKeys = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('STILL emits a ::-rooted absolute constant used inside a namespace (key stripped)', async () => {
  const { uses } = await run(['module App', '  x = ::TopHelper', 'end', ''].join('\n'));
  // The ::-prefix makes it a complete top-level path — no lexical shadowing risk.
  expect(symbolKeys(uses)).toContain('TopHelper');
});
