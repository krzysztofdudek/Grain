import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('honors `global using Foo.Bar;` as a prefix for a bare `new Baz()` too', async () => {
  const { uses } = await run(
    ['global using Foo.Bar;', 'class C { void M() { var x = new Baz(); } }', ''].join('\n'),
  );
  expect(symbolKeys(uses)).toContain('Foo.Bar.Baz');
});
