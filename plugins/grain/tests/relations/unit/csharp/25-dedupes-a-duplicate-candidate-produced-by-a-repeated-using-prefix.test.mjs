import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const groupContaining = (uses, key) => {
  const dep = uses.find((u) => u.candidates.some((c) => c.kind === 'symbol' && c.symbolKey === key));
  return dep?.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : []));
};

test('DEDUPES a duplicate candidate produced by a REPEATED using prefix WITHIN the group', async () => {
  // Two identical `using A;` directives yield the same prefix; the bare base `Baz` would
  // produce `A.Baz` twice in the same ordered group, but within-group dedup collapses it
  // to a single candidate (order preserved).
  const { uses } = await run(['using A;', 'using A;', 'class C : Baz { }', ''].join('\n'));
  const group = groupContaining(uses, 'A.Baz');
  expect(group?.filter((k) => k === 'A.Baz')).toHaveLength(1);
});
