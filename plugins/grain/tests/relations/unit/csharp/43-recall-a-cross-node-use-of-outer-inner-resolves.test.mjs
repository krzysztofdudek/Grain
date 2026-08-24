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

/** Resolve a reference whose group contains `key`, via the ordered first-unique-match walk. */
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

test('RECALL: a cross-node use of `Outer.Inner` resolves to the declaring node via the guarded `+`-split', async () => {
  // Declaration side keys the nested type `App.Outer+Inner`. The use writes `Outer.Inner`
  // (here fully qualified `App.Outer.Inner`); the resolver splits at the declared type
  // `App.Outer` → `App.Outer+Inner` and binds the declaring node.
  await parseAll(
    [
      { path: 'src/a/Nested.cs', code: 'namespace App;\nclass Outer { class Inner { } }\n' },
      { path: 'src/c/Use.cs', code: 'namespace Other;\nclass C { void M() { var x = new App.Outer.Inner(); } }\n' },
    ],
    ([decl, consumer]) => {
      const st = new SymbolTable();
      for (const d of csharpExtractor.declarations(decl)) st.declare('csharp', d.symbolKey, decl.path);
      expect(st.has('csharp', 'App.Outer')).toBe(true); // declared TYPE → the split guard fires
      expect(st.resolveUnique('csharp', 'App.Outer+Inner')).toBe('src/a/Nested.cs');
      const owners = csharpExtractor.uses(consumer);
      expect(walk(owners, 'App.Outer.Inner', st, (f) => (f === 'src/a/Nested.cs' ? 'a' : undefined), consumer.path)).toBe('a');
    },
  );
});
