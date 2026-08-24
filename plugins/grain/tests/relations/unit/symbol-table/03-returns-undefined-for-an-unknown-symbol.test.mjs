import { test } from 'node:test';
import { expect, SymbolTable } from '../_unit-harness.mjs';

test('returns undefined for an unknown symbol', () => {
  expect(new SymbolTable().resolveUnique('csharp', 'Nope')).toBeUndefined();
});
