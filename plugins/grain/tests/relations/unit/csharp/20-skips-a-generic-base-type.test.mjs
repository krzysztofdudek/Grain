import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('SKIPS a GENERIC base type (`: List<int>`) — not a bare identifier, no candidate', async () => {
  // A `generic_name` is neither a bare identifier nor a qualified_name, so bareTypeName
  // returns undefined and emitBare is skipped.
  const { uses } = await run(['using Foo.Bar;', 'class C : List<int> { }', ''].join('\n'));
  expect(symbolKeys(uses)).toHaveLength(0);
});
