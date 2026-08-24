import { test } from 'node:test';
import { expect, withParsedFiles, extractorForLanguage, SymbolTable, makeResolver } from '../_unit-harness.mjs';

const csharpExtractor = extractorForLanguage('csharp');

const walkResolve = (uses, key, resolver, fromFile) => {
  const dep = uses.find((u) => u.candidates.some((c) => c.kind === 'symbol' && c.symbolKey === key));
  if (dep === undefined) return undefined;
  for (const cand of dep.candidates) {
    const outcome = resolver.classify(cand, fromFile, 'csharp');
    if (outcome.kind === 'resolved') return outcome.ownerNode;
    if (outcome.kind === 'ambiguous') return undefined;
  }
  return undefined;
};

const walk = (uses, key, st, ownerOf, fromFile) => {
  const resolver = makeResolver({ ownerIndex: { ownerOf }, symbolTable: st, resolvePathToFile: () => undefined });
  return walkResolve(uses, key, resolver, fromFile);
};

function parseAll(specs, fn) {
  return withParsedFiles(
    specs.map((s) => ({ path: s.path, code: s.code, language: 'csharp' })),
    fn,
  );
}

test('SPLIT AMBIGUITY SILENCES: two mapped files both declaring `App.Outer+Inner` → silence, not a flag', async () => {
  await parseAll(
    [
      { path: 'src/a/Nested.cs', code: 'namespace App;\nclass Outer { class Inner { } }\n' },
      { path: 'src/b/Nested.cs', code: 'namespace App;\nclass Outer { class Inner { } }\n' },
      { path: 'src/c/Use.cs', code: 'namespace Other;\nclass C { void M() { var x = new App.Outer.Inner(); } }\n' },
    ],
    ([a, b, consumer]) => {
      const st = new SymbolTable();
      for (const f of [a, b]) {
        for (const d of csharpExtractor.declarations(f)) st.declare('csharp', d.symbolKey, f.path);
      }
      const owners = csharpExtractor.uses(consumer);
      // `App.Outer` is declared in two files (defCount 2) — the split guard `has` still fires,
      // but the split key `App.Outer+Inner` maps to two files → ≥2 distinct → ambiguous → silence.
      expect(walk(owners, 'App.Outer.Inner', st, () => 'someNode', consumer.path)).toBeUndefined();
    },
  );
});
