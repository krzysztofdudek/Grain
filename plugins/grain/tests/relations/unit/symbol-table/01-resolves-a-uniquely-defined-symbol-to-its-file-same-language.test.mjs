import { test } from 'node:test';
import { expect, SymbolTable } from '../_unit-harness.mjs';

test('resolves a uniquely-defined symbol to its file (same language)', () => {
  const t = new SymbolTable();
  t.declare('csharp', 'Foo.Bar', 'src/a.cs');
  expect(t.resolveUnique('csharp', 'Foo.Bar')).toBe('src/a.cs');
});
