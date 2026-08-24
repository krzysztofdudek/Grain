import { test } from 'node:test';
import { expect, SymbolTable, makeResolver } from '../_unit-harness.mjs';

// grain adaptation: plain { ownerOf } object stands in for Yggdrasil's OwnerIndex — grain has no owner-index module.
const owner = { ownerOf: (f) => (f === 'src/b.cs' ? 'b' : undefined) };

test('path: a mapped file is `resolved`; the path axis never yields `ambiguous`', () => {
  const r = makeResolver({ ownerIndex: owner, symbolTable: new SymbolTable(), resolvePathToFile: () => 'src/b.cs' });
  expect(r.classify({ kind: 'path', specifier: './b' }, 'src/a.cs', 'csharp')).toEqual({
    kind: 'resolved', ownerNode: 'b', resolvedFile: 'src/b.cs',
  });
});
