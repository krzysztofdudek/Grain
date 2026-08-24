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

test('EXTERNAL/BCL type resolves to NO node (System.* → external, never a violation)', async () => {
  const { uses } = await run(
    ['class C { System.Text.StringBuilder _sb; void M() { var x = new System.Collections.Generic.List<int>(); } }', ''].join('\n'),
  );
  // Candidates like System.Text.StringBuilder are emitted, but the symbol table /
  // owner index never map them to a node → undefined.
  const owners = resolveAll(uses, new SymbolTable(), () => undefined);
  expect(owners.every((o) => o === undefined)).toBe(true);
});
