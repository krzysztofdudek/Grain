import { test } from 'node:test';
import { expect, withParsedFiles, extractorForLanguage, SymbolTable, makeResolver } from '../_unit-harness.mjs';

const csharpExtractor = extractorForLanguage('csharp');

const groupContaining = (uses, key) => {
  const dep = uses.find((u) => u.candidates.some((c) => c.kind === 'symbol' && c.symbolKey === key));
  return dep?.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : []));
};

function parseAll(specs, fn) {
  return withParsedFiles(
    specs.map((s) => ({ path: s.path, code: s.code, language: 'csharp' })),
    fn,
  );
}

test('ORDERED GROUP: nearest expansion FIRST, verbatim LAST — and the verbatim binds when nothing nearer does (recall)', async () => {
  // Inside `namespace App;`, `Models.Order` is ONE ordered group: the enclosing-namespace
  // expansion `App.Models.Order` (nearest) THEN the verbatim `Models.Order` (last). When only
  // the top-level form is declared, the walk skips the absent nearest and binds the verbatim
  // — the real dependency is found, not over-silenced. (This replaces the C5-era false-green
  // assertion that treated an independent verbatim hint as a hit regardless of order.)
  await parseAll(
    [{ path: 'src/c/Use.cs', code: 'namespace App;\nclass C { void M() { var o = new Models.Order(); } }\n' }],
    ([consumer]) => {
      const group = groupContaining(csharpExtractor.uses(consumer), 'Models.Order');
      expect(group).toEqual(['App.Models.Order', 'Models.Order']); // nearest first, verbatim last

      const st = new SymbolTable();
      st.declare('csharp', 'Models.Order', 'src/m/Order.cs'); // ONLY the top-level form exists
      const resolver = makeResolver({
        ownerIndex: { ownerOf: (f) => (f === 'src/m/Order.cs' ? 'm' : undefined) },
        symbolTable: st,
        resolvePathToFile: () => undefined,
      });
      // The nearest expansion is ABSENT (continue); the verbatim then RESOLVES → the binding.
      expect(resolver.classify({ kind: 'symbol', symbolKey: 'App.Models.Order' }, consumer.path, 'csharp')).toEqual({ kind: 'absent' });
      expect(resolver.classify({ kind: 'symbol', symbolKey: 'Models.Order' }, consumer.path, 'csharp')).toEqual({
        kind: 'resolved', ownerNode: 'm', resolvedFile: 'src/m/Order.cs',
      });
    },
  );
});
