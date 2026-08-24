// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — C1: bare constants inside a namespace are suppressed (zero-FP)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
const symbolKeys = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('SUPPRESSES a bare unqualified superclass inside a nested namespace', async () => {
  // `class Widget < Base` nested in module App — `Base` is bare → suppressed.
  const { uses } = await run(['module App', '  class Widget < Base', '  end', 'end', ''].join('\n'));
  expect(symbolKeys(uses)).not.toContain('Base');
  expect(symbolKeys(uses)).toHaveLength(0);
});
