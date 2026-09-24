// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — lexical candidates through Module.nesting
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
/** Every candidate key of every symbol group, in order, one array per group. */
const groups = (uses) =>
  uses.map((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('a bare constant inside a module body yields the nesting candidate, then the top level', async () => {
  const { uses } = await run(['module App', '  x = Helper', 'end', ''].join('\n'));
  expect(groups(uses)).toEqual([['App::Helper', 'Helper']]);
  const top = uses[0].candidates[1];
  expect(top.kind === 'symbol' && top.rubyInheritGuard).toBe('Helper');
});
