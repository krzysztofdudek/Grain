import { test } from 'node:test';
import { expect, SymbolTable, makeResolver } from '../_unit-harness.mjs';

// grain adaptation: plain { ownerOf } object stands in for Yggdrasil's OwnerIndex — grain has no owner-index module.
const owner = { ownerOf: (f) => (f === 'src/b.cs' ? 'b' : undefined) };

test('resolves a unique same-language symbol to a mapped owner', () => {
  const st = new SymbolTable();
  st.declare('csharp', 'Foo.Bar', 'src/b.cs');
  const r = makeResolver({ ownerIndex: owner, symbolTable: st, resolvePathToFile: () => undefined });
  expect(r.resolve({ kind: 'symbol', symbolKey: 'Foo.Bar' }, 'src/a.cs', 'csharp')).toEqual({ ownerNode: 'b', resolvedFile: 'src/b.cs' });
});
