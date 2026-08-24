import { test } from 'node:test';
import { expect, SymbolTable, makeResolver } from '../_unit-harness.mjs';

// grain adaptation: plain { ownerOf } object stands in for Yggdrasil's OwnerIndex — grain has no owner-index module.
const rbOwner = { ownerOf: (f) => (f === 'lib/x.rb' ? 'x' : undefined) };
const rubyTable = (...decls) => {
  const st = new SymbolTable();
  for (const [k, f] of decls) st.declare('ruby', k, f);
  return st;
};

test('resolve: a root-anchored constant resolves to its owner', () => {
  const st = rubyTable(['Rack', 'lib/x.rb'], ['Rack::Handler', 'lib/x.rb']);
  const r = makeResolver({ ownerIndex: rbOwner, symbolTable: st, resolvePathToFile: () => undefined });
  expect(r.resolve({ kind: 'symbol', symbolKey: 'Rack::Handler' }, 'lib/a.rb', 'ruby')).toEqual({
    ownerNode: 'x', resolvedFile: 'lib/x.rb',
  });
});
