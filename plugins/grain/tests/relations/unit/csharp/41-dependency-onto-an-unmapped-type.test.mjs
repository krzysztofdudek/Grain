import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage, SymbolTable, makeResolver } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const resolveAll = (uses, st, ownerOf) => {
  const resolver = makeResolver({
    ownerIndex: { ownerOf },
    symbolTable: st,
    resolvePathToFile: () => undefined,
  });
  return uses.map((u) => {
    for (const cand of u.candidates) {
      const outcome = resolver.classify(cand, 'src/c/Use.cs', 'csharp');
      if (outcome.kind === 'resolved') return outcome.ownerNode;
      if (outcome.kind === 'ambiguous') return undefined;
    }
    return undefined;
  });
};

test('dependency onto an UNMAPPED type (declared in table, file owned by NO node) → undefined', async () => {
  const { uses } = await run(
    ['class C { void M() { var x = new Foo.Bar.Baz(); } }', ''].join('\n'),
  );
  const st = new SymbolTable();
  st.declare('csharp', 'Foo.Bar.Baz', 'src/unmapped/Baz.cs');
  // ownerOf returns undefined for the unmapped file → resolver yields undefined (D7).
  const owners = resolveAll(uses, st, () => undefined);
  expect(owners.every((o) => o === undefined)).toBe(true);
});
