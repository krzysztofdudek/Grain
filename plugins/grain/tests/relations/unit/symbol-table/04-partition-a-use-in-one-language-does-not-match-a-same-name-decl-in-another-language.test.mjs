import { test } from 'node:test';
import { expect, SymbolTable } from '../_unit-harness.mjs';

test('PARTITION: a use in one language does NOT match a same-name decl in another language', () => {
  // The cross-language bare-name FP: C++ `class Connection` must not satisfy a Ruby `Connection`.
  const t = new SymbolTable();
  t.declare('cpp', 'Connection', 'src/net/connection.cpp');
  expect(t.resolveUnique('ruby', 'Connection')).toBeUndefined(); // partitioned → silence
  expect(t.resolveUnique('cpp', 'Connection')).toBe('src/net/connection.cpp'); // same language still resolves
});
