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

test("builds a SymbolTable from two files' declarations() and resolves a third file's qualified use to the right file", async () => {
  await parseAll(
    [
      { path: 'src/a/Gateway.cs', code: 'namespace MyApp.Payments;\npublic class Gateway { }\n' },
      { path: 'src/b/Audit.cs', code: 'namespace MyApp.Audit;\npublic class AuditLog { }\n' },
      { path: 'src/c/Order.cs', code: 'namespace MyApp.Orders;\nclass Order { void M() { var g = new MyApp.Payments.Gateway(); } }\n' },
    ],
    ([fileA, fileB, consumer]) => {
      // Build the shared SymbolTable exactly as pass.ts step 4 does.
      const st = new SymbolTable();
      for (const f of [fileA, fileB]) {
        for (const d of csharpExtractor.declarations(f)) st.declare('csharp', d.symbolKey, f.path);
      }

      // The consumer's qualified `new` resolves to fileA. The group is
      // [MyApp.Orders.MyApp.Payments.Gateway (enclosing-ns, absent), MyApp.Payments.Gateway
      // (verbatim, binds)] — the ordered walk skips the absent nearest and binds the verbatim.
      const uses = csharpExtractor.uses(consumer);
      // Enclosing-ns chain innermost→outermost (MyApp.Orders, MyApp), then the verbatim LAST.
      expect(groupContaining(uses, 'MyApp.Payments.Gateway')).toEqual([
        'MyApp.Orders.MyApp.Payments.Gateway',
        'MyApp.MyApp.Payments.Gateway',
        'MyApp.Payments.Gateway',
      ]);
      expect(st.resolveUnique('csharp', 'MyApp.Payments.Gateway')).toBe('src/a/Gateway.cs');

      // And the full resolver wires symbol → owner node (mirrors resolver.ts + the pass walk).
      const ownerIndex = {
        ownerOf: (f) =>
          f === 'src/a/Gateway.cs' ? 'a' : f === 'src/b/Audit.cs' ? 'b' : undefined,
      };
      const resolver = makeResolver({
        ownerIndex,
        symbolTable: st,
        resolvePathToFile: () => undefined,
      });
      expect(walkResolve(uses, 'MyApp.Payments.Gateway', resolver, consumer.path)).toBe('a');
    },
  );
});
