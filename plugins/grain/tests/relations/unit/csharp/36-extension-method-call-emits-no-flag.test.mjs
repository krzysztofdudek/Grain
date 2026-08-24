import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('EXTENSION METHOD call emits NO flag (order.Validate() — receiver type unknown)', async () => {
  const { uses } = await run(
    ['class C { void M(object order) { order.Validate(); } }', ''].join('\n'),
  );
  // No qualified_name, no base_list, no `new` of a named type → no hints at all.
  expect(symbolKeys(uses)).toHaveLength(0);
});
