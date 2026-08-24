import { test } from 'node:test';
import { expect, SymbolTable, makeResolver } from '../_unit-harness.mjs';

// grain adaptation: plain { ownerOf } object stands in for Yggdrasil's OwnerIndex — grain has no owner-index module.
const owner = { ownerOf: (f) => (f === 'src/b.cs' ? 'b' : undefined) };

test('symbol: a UNIQUE mapped definition is `resolved` with its owner + file', () => {
  const st = new SymbolTable();
  st.declare('csharp', 'Foo.Bar', 'src/b.cs');
  const r = makeResolver({ ownerIndex: owner, symbolTable: st, resolvePathToFile: () => undefined });
  expect(r.classify({ kind: 'symbol', symbolKey: 'Foo.Bar' }, 'src/a.cs', 'csharp')).toEqual({
    kind: 'resolved', ownerNode: 'b', resolvedFile: 'src/b.cs',
  });
});
