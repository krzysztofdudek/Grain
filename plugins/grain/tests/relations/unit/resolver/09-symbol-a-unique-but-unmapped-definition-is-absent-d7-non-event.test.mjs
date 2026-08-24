import { test } from 'node:test';
import { expect, SymbolTable, makeResolver } from '../_unit-harness.mjs';

// grain adaptation: plain { ownerOf } object stands in for Yggdrasil's OwnerIndex — grain has no owner-index module.
const owner = { ownerOf: (f) => (f === 'src/b.cs' ? 'b' : undefined) };

test('symbol: a UNIQUE but UNMAPPED definition is `absent` (D7 non-event — continue, never ambiguous)', () => {
  const st = new SymbolTable();
  st.declare('csharp', 'X.Y', 'vendor/x.cs'); // ownerOf(vendor/x.cs) = undefined
  const r = makeResolver({ ownerIndex: owner, symbolTable: st, resolvePathToFile: () => undefined });
  expect(r.classify({ kind: 'symbol', symbolKey: 'X.Y' }, 'src/a.cs', 'csharp')).toEqual({ kind: 'absent' });
});
