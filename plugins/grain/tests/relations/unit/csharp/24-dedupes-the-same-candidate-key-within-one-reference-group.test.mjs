import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

test('DEDUPES the SAME candidate key WITHIN one reference group (`: Foo.Bar, Foo.Bar`)', async () => {
  // Each base entry is its own reference → its own ordered group. The dedup is now
  // WITHIN a group: a group never lists the same candidate key twice. (Two distinct base
  // entries legitimately produce two groups — each a clean single-candidate `[Foo.Bar]`.)
  const { uses } = await run(['class C : Foo.Bar, Foo.Bar { }', ''].join('\n'));
  for (const u of uses) {
    const keys = u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : []));
    expect(new Set(keys).size).toBe(keys.length); // no duplicate key inside any one group
  }
});
