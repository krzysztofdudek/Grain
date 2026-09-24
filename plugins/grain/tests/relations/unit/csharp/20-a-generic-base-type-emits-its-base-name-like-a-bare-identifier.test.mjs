import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('a GENERIC base type (`: List<int>`) emits its BASE name like a bare identifier (B5)', async () => {
  // The generic's base name is a type reference of its own; an external container such as `List` simply resolves to no in-graph declaration (fail-to-silence), so the candidates are harmless — only the in-scope readings are ever produced.
  const { uses } = await run(['using Foo.Bar;', 'class C : List<int> { }', ''].join('\n'));
  expect(symbolKeys(uses)).toEqual(['Foo.Bar.List', 'List']);
});
