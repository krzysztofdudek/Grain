import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage, SymbolTable, makeResolver } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('does NOT honor `global using` from another file: a bare name with no in-file using stays SILENT at resolution', async () => {
  // No `using` directive and no namespace in THIS file → the only candidate for a bare base
  // type is its verbatim top-level form (`SomeGlobalType`), the harmless last candidate. With
  // no in-graph file declaring that bare top-level type, it resolves to nothing → SILENCE.
  const { uses } = await run(['class C : SomeGlobalType { }', ''].join('\n'));
  expect(symbolKeys(uses)).toEqual(['SomeGlobalType']);
  const st = new SymbolTable(); // empty table — `global using` declared elsewhere is invisible here
  const resolver = makeResolver({
    ownerIndex: { ownerOf: () => 'someNode' },
    symbolTable: st,
    resolvePathToFile: () => undefined,
  });
  expect(resolver.resolve({ kind: 'symbol', symbolKey: 'SomeGlobalType' }, 'src/c/Use.cs', 'csharp')).toBeUndefined();
});
