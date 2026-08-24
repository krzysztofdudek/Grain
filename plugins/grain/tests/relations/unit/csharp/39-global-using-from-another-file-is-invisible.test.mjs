import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage, SymbolTable, makeResolver } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

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

test('`global using` from ANOTHER file is invisible: a bare type stays SILENT at resolution', async () => {
  // No using/namespace in this file; the bare base type's only candidate is its verbatim
  // top-level form (`RepositoryBase`, the harmless last candidate). A `global using` declared
  // elsewhere is invisible here, so nothing maps that bare name to a node → SILENCE.
  const { uses } = await run(['class C : RepositoryBase { }', ''].join('\n'));
  expect(symbolKeys(uses)).toEqual(['RepositoryBase']);
  const owners = resolveAll(uses, new SymbolTable(), () => undefined);
  expect(owners.every((o) => o === undefined)).toBe(true);
});
