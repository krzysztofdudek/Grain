import { test } from 'node:test';
import { expect, SymbolTable, makeResolver } from '../_unit-harness.mjs';

// grain adaptation: plain { ownerOf } object stands in for Yggdrasil's OwnerIndex — grain has no owner-index module.
const owner = { ownerOf: (f) => (f === 'src/b.cs' ? 'b' : undefined) };

test('SILENCES a symbol whose only same-name decl is in ANOTHER language', () => {
  // owner.ownerOf maps src/b.cs → 'b'; but the decl is keyed under 'cpp', the use is 'ruby'.
  const st = new SymbolTable();
  st.declare('cpp', 'Connection', 'src/b.cs');
  const r = makeResolver({ ownerIndex: owner, symbolTable: st, resolvePathToFile: () => undefined });
  expect(r.resolve({ kind: 'symbol', symbolKey: 'Connection' }, 'src/a.rb', 'ruby')).toBeUndefined();
});
