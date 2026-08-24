import { test } from 'node:test';
import { expect, SymbolTable } from '../_unit-harness.mjs';

test('PARTITION: the SAME symbolKey may resolve independently per language', () => {
  const t = new SymbolTable();
  t.declare('ruby', 'Connection', 'src/a/connection.rb');
  t.declare('cpp', 'Connection', 'src/net/connection.cpp');
  expect(t.resolveUnique('ruby', 'Connection')).toBe('src/a/connection.rb');
  expect(t.resolveUnique('cpp', 'Connection')).toBe('src/net/connection.cpp');
});
