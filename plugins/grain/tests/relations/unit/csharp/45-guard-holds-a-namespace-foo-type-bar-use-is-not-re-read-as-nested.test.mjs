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

test('GUARD HOLDS: a namespace-`Foo` type-`Bar` use is NOT re-read as nested `Foo+Bar` even if one coincidentally exists', async () => {
  // `Foo` is a NAMESPACE (no `Foo` type declared), so the `Foo.Bar` use is not split at
  // `Foo`. A coincidental nested `Foo+Bar` in another node must NOT be matched → silence,
  // even though `Foo.Bar` (top-level dotted) maps to node x.
  await parseAll(
    [
      { path: 'src/y/Coin.cs', code: 'namespace App;\nclass Foo { class Bar { } }\n' }, // App.Foo+Bar
      { path: 'src/x/Bar.cs', code: 'namespace Foo;\nclass Bar { }\n' }, // Foo.Bar (namespace Foo)
      { path: 'src/c/Use.cs', code: 'namespace Other;\nclass C { void M() { var x = new Foo.Bar(); } }\n' },
    ],
    ([coincidental, real, consumer]) => {
      const st = new SymbolTable();
      for (const f of [coincidental, real]) {
        for (const d of csharpExtractor.declarations(f)) st.declare('csharp', d.symbolKey, f.path);
      }
      // `Foo` is NOT a declared type (only the namespace), so no split of `Foo.Bar` at `Foo`.
      expect(st.has('csharp', 'Foo')).toBe(false);
      const owners = csharpExtractor.uses(consumer);
      // `Foo.Bar` (verbatim) binds the real top-level `Foo.Bar` in node x; the coincidental
      // `App.Foo+Bar` is NEVER produced for this use. So it resolves to x (the legitimate dotted
      // top-level type), NOT ambiguously to y.
      expect(walk(owners, 'Foo.Bar', st, (f) => (f === 'src/x/Bar.cs' ? 'x' : f === 'src/y/Coin.cs' ? 'y' : undefined), consumer.path)).toBe('x');
    },
  );
});
