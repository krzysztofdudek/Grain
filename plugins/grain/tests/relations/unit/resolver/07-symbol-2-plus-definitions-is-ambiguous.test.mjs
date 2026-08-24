import { test } from 'node:test';
import { expect, SymbolTable, makeResolver } from '../_unit-harness.mjs';

// grain adaptation: plain { ownerOf } object stands in for Yggdrasil's OwnerIndex — grain has no owner-index module.
const owner = { ownerOf: (f) => (f === 'src/b.cs' ? 'b' : undefined) };

test('symbol: 2+ definitions is `ambiguous` (the case `resolveUnique` collapsed to undefined)', () => {
  const st = new SymbolTable();
  st.declare('csharp', 'A', 'src/b.cs');
  st.declare('csharp', 'A', 'src/c.cs');
  const r = makeResolver({ ownerIndex: owner, symbolTable: st, resolvePathToFile: () => undefined });
  expect(r.classify({ kind: 'symbol', symbolKey: 'A' }, 'src/a.cs', 'csharp')).toEqual({ kind: 'ambiguous' });
});
