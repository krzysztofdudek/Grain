import { test } from 'node:test';
import { expect, SymbolTable, makeResolver } from '../_unit-harness.mjs';

// grain adaptation: plain { ownerOf } object stands in for Yggdrasil's OwnerIndex — grain has no owner-index module.
const owner = { ownerOf: (f) => (f === 'src/b.cs' ? 'b' : undefined) };

test('path: a resolved-but-UNMAPPED file is `absent` (D7)', () => {
  const r = makeResolver({ ownerIndex: owner, symbolTable: new SymbolTable(), resolvePathToFile: () => 'vendor/x.cs' });
  expect(r.classify({ kind: 'path', specifier: './x' }, 'src/a.cs', 'csharp')).toEqual({ kind: 'absent' });
});
