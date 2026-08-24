// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby extractor — uses() emits SYMBOL hints (constants)
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
const run = (code) => runExtractor(rubyExtractor, 'ruby', '.rb', code);
const symbolKeys = (uses) =>
  uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('does NOT emit the `name` field constant of a module declaration as a use', async () => {
  // `module App` — the `App` constant is the module name (a definition), never a use.
  const { uses, declarations } = await run('module App\nend\n');
  expect(symbolKeys(uses)).not.toContain('App');
  expect(symbolKeys(uses)).toHaveLength(0);
  expect(declarations.map((d) => d.symbolKey)).toContain('App');
});
