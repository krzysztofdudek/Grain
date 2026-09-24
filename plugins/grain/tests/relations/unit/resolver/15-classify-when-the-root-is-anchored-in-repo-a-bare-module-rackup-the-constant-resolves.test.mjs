import { test } from 'node:test';
import { expect, SymbolTable, makeResolver } from '../_unit-harness.mjs';

// grain adaptation: plain { ownerOf } object stands in for Yggdrasil's OwnerIndex — grain has no owner-index module.
const rbOwner = { ownerOf: (f) => (f === 'lib/x.rb' ? 'x' : undefined) };
const rubyTable = (...decls) => {
  const st = new SymbolTable();
  for (const [k, f] of decls) st.declare('ruby', k, f);
  return st;
};

test('classify: when the ROOT is anchored in-repo (a bare `module Rackup`), the constant resolves', () => {
  const st = rubyTable(['Rackup', 'lib/x.rb'], ['Rackup::Handler', 'lib/x.rb']);
  const r = makeResolver({ ownerIndex: rbOwner, symbolTable: st, resolvePathToFile: () => undefined });
  expect(r.classify({ kind: 'symbol', symbolKey: 'Rackup::Handler' }, 'lib/a.rb', 'ruby')).toEqual({
    kind: 'resolved', ownerNode: 'x', resolvedFile: 'lib/x.rb',
  });
});
