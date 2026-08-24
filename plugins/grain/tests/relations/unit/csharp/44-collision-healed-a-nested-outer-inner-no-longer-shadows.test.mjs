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

test('COLLISION HEALED: a nested `App.Outer+Inner` no longer shadows a top-level `App.Inner` (D-N5)', async () => {
  // A nested Inner (node a) and a top-level Inner (node b) of the same simple name. Because
  // the nested type is keyed `App.Outer+Inner` (not `App.Inner`), a use of the TOP-LEVEL
  // `App.Inner` resolves cleanly to node b — the collateral silencing is gone.
  await parseAll(
    [
      { path: 'src/a/Nested.cs', code: 'namespace App;\nclass Outer { class Inner { } }\n' },
      { path: 'src/b/Inner.cs', code: 'namespace App;\nclass Inner { }\n' },
      { path: 'src/c/Use.cs', code: 'namespace Other;\nclass C { void M() { var x = new App.Inner(); } }\n' },
    ],
    ([nested, topLevel, consumer]) => {
      const st = new SymbolTable();
      for (const f of [nested, topLevel]) {
        for (const d of csharpExtractor.declarations(f)) st.declare('csharp', d.symbolKey, f.path);
      }
      expect(st.resolveUnique('csharp', 'App.Inner')).toBe('src/b/Inner.cs'); // exactly one def now
      const owners = csharpExtractor.uses(consumer);
      expect(walk(owners, 'App.Inner', st, (f) => (f === 'src/b/Inner.cs' ? 'b' : undefined), consumer.path)).toBe('b');
    },
  );
});
