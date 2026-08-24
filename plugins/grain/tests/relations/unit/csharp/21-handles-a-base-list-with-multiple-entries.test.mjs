import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('handles a base_list with MULTIPLE entries (qualified bare base + bare interface)', async () => {
  // Two base entries on one line: a bare base and a bare interface, each qualified by
  // the using prefix; a third generic entry is skipped.
  const { uses } = await run(
    ['using N;', 'class C : MyBase, IFoo<int> { }', ''].join('\n'),
  );
  const keys = symbolKeys(uses);
  expect(keys).toContain('N.MyBase'); // bare base qualified
  expect(keys.every((k) => !k.includes('IFoo'))).toBe(true); // generic skipped
});
