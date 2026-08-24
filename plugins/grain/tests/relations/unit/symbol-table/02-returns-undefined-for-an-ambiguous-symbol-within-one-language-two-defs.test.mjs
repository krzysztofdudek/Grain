import { test } from 'node:test';
import { expect, SymbolTable } from '../_unit-harness.mjs';

test('returns undefined for an ambiguous symbol within one language (two defs)', () => {
  const t = new SymbolTable();
  t.declare('csharp', 'Foo.Bar', 'src/a.cs');
  t.declare('csharp', 'Foo.Bar', 'vendor/b.cs');
  expect(t.resolveUnique('csharp', 'Foo.Bar')).toBeUndefined();
});
