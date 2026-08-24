import { test } from 'node:test';
import { expect, withParsedFiles, extractorForLanguage, SymbolTable, makeResolver } from '../_unit-harness.mjs';

const csharpExtractor = extractorForLanguage('csharp');

const groupContaining = (uses, key) => {
  const dep = uses.find((u) => u.candidates.some((c) => c.kind === 'symbol' && c.symbolKey === key));
  return dep?.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : []));
};

const walkResolve = (uses, key, resolver, fromFile) => {
  const dep = uses.find((u) => u.candidates.some((c) => c.kind === 'symbol' && c.symbolKey === key));
  if (dep === undefined) return undefined;
  for (const cand of dep.candidates) {
    const outcome = resolver.classify(cand, fromFile, 'csharp');
    if (outcome.kind === 'resolved') return outcome.ownerNode; // first bind wins, stop
    if (outcome.kind === 'ambiguous') return undefined; // nearer ambiguity silences the group
    // absent → continue
  }
  return undefined;
};

function parseAll(specs, fn) {
  return withParsedFiles(
    specs.map((s) => ({ path: s.path, code: s.code, language: 'csharp' })),
    fn,
  );
}

test('BARE name resolves through the using scope to the right file', async () => {
  await parseAll(
    [
      { path: 'src/a/Gateway.cs', code: 'namespace MyApp.Payments;\npublic class Gateway { }\n' },
      {
        path: 'src/c/Order.cs',
        code: 'using MyApp.Payments;\nnamespace MyApp.Orders;\nclass Order { void M() { var g = new Gateway(); } }\n',
      },
    ],
    ([fileA, consumer]) => {
      const st = new SymbolTable();
      for (const d of csharpExtractor.declarations(fileA)) st.declare('csharp', d.symbolKey, fileA.path);

      // The bare `new Gateway()` group puts the using-prefix expansion `MyApp.Payments.Gateway`
      // ahead of the bare-last `Gateway`; the walk binds it to fileA.
      const uses = csharpExtractor.uses(consumer);
      expect(groupContaining(uses, 'MyApp.Payments.Gateway')).toBeDefined();
      expect(st.resolveUnique('csharp', 'MyApp.Payments.Gateway')).toBe('src/a/Gateway.cs');
      const resolver = makeResolver({
        ownerIndex: { ownerOf: (f) => (f === 'src/a/Gateway.cs' ? 'a' : undefined) },
        symbolTable: st,
        resolvePathToFile: () => undefined,
      });
      expect(walkResolve(uses, 'MyApp.Payments.Gateway', resolver, consumer.path)).toBe('a');
    },
  );
});
