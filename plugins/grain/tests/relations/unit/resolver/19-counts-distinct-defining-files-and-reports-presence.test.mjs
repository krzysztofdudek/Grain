import { test } from 'node:test';
import { expect, SymbolTable } from '../_unit-harness.mjs';

test('counts distinct defining files and reports presence', () => {
  const st = new SymbolTable();
  expect(st.defCount('csharp', 'A')).toBe(0);
  expect(st.has('csharp', 'A')).toBe(false);
  st.declare('csharp', 'A', 'src/b.cs');
  expect(st.defCount('csharp', 'A')).toBe(1);
  expect(st.has('csharp', 'A')).toBe(true);
  st.declare('csharp', 'A', 'src/c.cs');
  expect(st.defCount('csharp', 'A')).toBe(2);
  expect(st.has('csharp', 'A')).toBe(true);
  // resolveUnique is unchanged: exactly-one-or-undefined.
  expect(st.resolveUnique('csharp', 'A')).toBeUndefined();
});
