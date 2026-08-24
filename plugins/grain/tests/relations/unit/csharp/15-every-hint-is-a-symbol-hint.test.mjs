import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

test('every hint is a SYMBOL hint (csharp resolves through the SymbolTable, never a path)', async () => {
  const { uses } = await run(
    ['using Foo.Bar;', 'class C : Baz { Foo.Bar.Dep _d; }', ''].join('\n'),
  );
  expect(uses.length).toBeGreaterThan(0);
  expect(uses.every((u) => u.candidates[0].kind === 'symbol')).toBe(true);
});
