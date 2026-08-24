import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage, SymbolTable, makeResolver } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const resolveAll = (uses, st, ownerOf) => {
  const resolver = makeResolver({
    ownerIndex: { ownerOf },
    symbolTable: st,
    resolvePathToFile: () => undefined,
  });
  return uses.map((u) => {
    for (const cand of u.candidates) {
      const outcome = resolver.classify(cand, 'src/c/Use.cs', 'csharp');
      if (outcome.kind === 'resolved') return outcome.ownerNode;
      if (outcome.kind === 'ambiguous') return undefined;
    }
    return undefined;
  });
};

test("INTRA-NODE / family reference: resolves to a file, but to the consumer's OWN node (no flag at verify layer)", async () => {
  // This case shows the hint DOES resolve — the self/ancestor filtering is the
  // verifier's job (computeBasis), proven by the e2e round-trip. Here we only assert
  // the resolution points to the consumer's own node, which the verifier never flags.
  const { uses } = await run(
    ['namespace App;', 'class C { void M() { var x = new App.Sibling(); } }', ''].join('\n'),
  );
  const st = new SymbolTable();
  st.declare('csharp', 'App.Sibling', 'src/c/Sibling.cs'); // same node as the consumer
  const owners = resolveAll(uses, st, (f) => (f === 'src/c/Sibling.cs' ? 'c' : undefined));
  // It resolves to node 'c' — the consumer's own node — which is never an undeclared
  // cross-node dependency (the verifier's self/family filter handles it).
  expect(owners).toContain('c');
});
