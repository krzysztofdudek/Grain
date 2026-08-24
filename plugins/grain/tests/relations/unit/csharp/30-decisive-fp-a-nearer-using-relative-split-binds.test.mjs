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

test('DECISIVE FP (extractor/resolver level): a nearer using-relative split binds and the verbatim is NEVER reached', async () => {
  // The decisive false-positive case for this resolution order, at the candidate-walk
  // level. n1 owns
  // `App.Data.Models+Order` (nested) intra-node; n2 owns top-level `Models.Order`. The
  // consumer in `namespace App.Services; using App.Data;` writes `new Models.Order()`.
  // The ordered group [App.Services.Models.Order, App.Data.Models.Order, Models.Order] binds
  // the nearest that resolves — `App.Data.Models.Order` splits at the declared type
  // `App.Data.Models` to `App.Data.Models+Order` → n1 — and STOPS. The verbatim
  // `Models.Order` (which would resolve to n2) is never reached → no n1→n2 edge.
  await parseAll(
    [{ path: 'src/n1/Order.cs', code: 'namespace App.Services;\nusing App.Data;\npublic class C { void M() { var o = new Models.Order(); } }\n' }],
    ([consumer]) => {
      const st = new SymbolTable();
      st.declare('csharp', 'App.Data.Models', 'src/n1/Data.cs'); // the enclosing nested TYPE
      st.declare('csharp', 'App.Data.Models+Order', 'src/n1/Data.cs'); // the nested Order (n1)
      st.declare('csharp', 'Models.Order', 'src/n2/Order.cs'); // top-level Order (n2)
      const resolver = makeResolver({
        ownerIndex: {
          ownerOf: (f) => (f === 'src/n1/Data.cs' ? 'n1' : f === 'src/n2/Order.cs' ? 'n2' : undefined),
        },
        symbolTable: st,
        resolvePathToFile: () => undefined,
      });
      const group = groupContaining(csharpExtractor.uses(consumer), 'Models.Order');
      // Enclosing-ns chain innermost→outermost (App.Services, App), then the using prefix
      // (App.Data), then the verbatim LAST.
      expect(group).toEqual([
        'App.Services.Models.Order',
        'App.Models.Order',
        'App.Data.Models.Order',
        'Models.Order',
      ]);
      // Walk the group in order: first resolved wins and stops.
      const outcomes = group.map((k) => resolver.classify({ kind: 'symbol', symbolKey: k }, consumer.path, 'csharp'));
      expect(outcomes[0]).toEqual({ kind: 'absent' }); // App.Services.Models.Order — absent
      expect(outcomes[1]).toEqual({ kind: 'absent' }); // App.Models.Order — absent
      // App.Data.Models.Order splits at the declared type App.Data.Models → App.Data.Models+Order → n1.
      expect(outcomes[2]).toEqual({ kind: 'resolved', ownerNode: 'n1', resolvedFile: 'src/n1/Data.cs' }); // binds n1, stop
      // outcomes[3] (verbatim Models.Order → n2) is NEVER reached by the walk, so n2 is never flagged.
      expect(walkResolve(csharpExtractor.uses(consumer), 'Models.Order', resolver, consumer.path)).toBe('n1');
    },
  );
});
