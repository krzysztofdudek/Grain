import { test } from 'node:test';
import { expect, withParsedFiles, extractorForLanguage, SymbolTable, makeResolver } from '../_unit-harness.mjs';

const csharpExtractor = extractorForLanguage('csharp');

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

test('AMBIGUITY: two files declaring the SAME FQN → a use of it resolves to undefined (silence, no flag)', async () => {
  await parseAll(
    [
      { path: 'src/x/Thing.cs', code: 'namespace MyApp.Dup;\npublic class Thing { }\n' },
      { path: 'src/y/Thing.cs', code: 'namespace MyApp.Dup;\npublic class Thing { }\n' },
      { path: 'src/z/Use.cs', code: 'namespace MyApp.Z;\nclass Use { void M() { var t = new MyApp.Dup.Thing(); } }\n' },
    ],
    ([fileX, fileY, consumer]) => {
      const st = new SymbolTable();
      for (const f of [fileX, fileY]) {
        for (const d of csharpExtractor.declarations(f)) st.declare('csharp', d.symbolKey, f.path);
      }

      // resolveUnique returns undefined for the ambiguous FQN.
      expect(st.resolveUnique('csharp', 'MyApp.Dup.Thing')).toBeUndefined();

      // Through the ordered walk the use resolves to nothing — the verbatim `MyApp.Dup.Thing`
      // is present-but-ambiguous (2 defs) → the group silences; never a flag.
      const ownerIndex = { ownerOf: () => 'someNode' };
      const resolver = makeResolver({
        ownerIndex,
        symbolTable: st,
        resolvePathToFile: () => undefined,
      });
      const uses = csharpExtractor.uses(consumer);
      expect(resolver.classify({ kind: 'symbol', symbolKey: 'MyApp.Dup.Thing' }, consumer.path, 'csharp')).toEqual({ kind: 'ambiguous' });
      expect(walkResolve(uses, 'MyApp.Dup.Thing', resolver, consumer.path)).toBeUndefined();
    },
  );
});
