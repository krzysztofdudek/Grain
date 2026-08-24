import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('honors `global using Foo.Bar;` as a plain namespace prefix for a bare base type', async () => {
  // `global using` declared in THIS file is treated as a namespace import for this
  // file's scope, so a bare base type qualifies via the prefix.
  const { uses } = await run(['global using Foo.Bar;', 'class C : Baz { }', ''].join('\n'));
  expect(symbolKeys(uses)).toContain('Foo.Bar.Baz');
});
