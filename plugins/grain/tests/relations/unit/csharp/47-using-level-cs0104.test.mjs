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
    if (outcome.kind === 'resolved') return outcome.ownerNode;
    if (outcome.kind === 'ambiguous') return undefined;
  }
  return undefined;
};

function parseAll(specs, fn) {
  return withParsedFiles(
    specs.map((s) => ({ path: s.path, code: s.code, language: 'csharp' })),
    fn,
  );
}

test('USING-LEVEL CS0104: two usings each defining `Widget` → the using tier is AMBIGUOUS → SILENCE (never the foreign verbatim either)', async () => {
  // `using L1; using L2;` both declare `Widget`; a stray top-level `Widget` also exists in
  // node d. The bare base `Widget`'s ordered group is the enclosing-ns level, then the
  // code-point-sorted using prefixes (L1.Widget, L2.Widget), then the verbatim `Widget` LAST.
  // The using-prefix expansions form ONE binding level (a CS0104 set): both L1.Widget and
  // L2.Widget resolve, to DIFFERENT nodes → the simple name is genuinely ambiguous per the C#
  // spec → the whole group SILENCES. It binds NEITHER an arbitrary import NOR the foreign
  // top-level `Widget` in node d. Zero edge, zero false positive.
  await parseAll(
    [
      { path: 'src/a/W.cs', code: 'namespace L1;\nclass Widget { }\n' },
      { path: 'src/b/W.cs', code: 'namespace L2;\nclass Widget { }\n' },
      { path: 'src/d/W.cs', code: 'class Widget { }\n' }, // top-level `Widget` — must NEVER bind
      { path: 'src/c/Use.cs', code: 'using L1;\nusing L2;\nnamespace App;\nclass C : Widget { }\n' },
    ],
    ([l1, l2, verbatim, consumer]) => {
      const st = new SymbolTable();
      for (const f of [l1, l2, verbatim]) {
        for (const d of csharpExtractor.declarations(f)) st.declare('csharp', d.symbolKey, f.path);
      }
      const owners = csharpExtractor.uses(consumer);
      const group = groupContaining(owners, 'Widget');
      // Verbatim LAST; using prefixes code-point sorted ahead of it.
      expect(group).toEqual(['App.Widget', 'L1.Widget', 'L2.Widget', 'Widget']);
      expect(group[group.length - 1]).toBe('Widget');
      const resolver = makeResolver({
        ownerIndex: {
          ownerOf: (f) => (f === 'src/a/W.cs' ? 'a' : f === 'src/b/W.cs' ? 'b' : f === 'src/d/W.cs' ? 'd' : undefined),
        },
        symbolTable: st,
        resolvePathToFile: () => undefined,
      });
      const bound = walkResolve(owners, 'Widget', resolver, consumer.path);
      expect(bound).toBeUndefined(); // CS0104: ambiguous using tier silences the whole group
    },
  );
});
