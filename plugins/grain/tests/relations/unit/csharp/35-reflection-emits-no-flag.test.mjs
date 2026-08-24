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

test('REFLECTION emits NO flag (Type.GetType / Activator.CreateInstance with string names)', async () => {
  const { uses } = await run(
    [
      'using System;',
      'class R {',
      '  void M() {',
      '    var t = Type.GetType("MyApp.Payments.Gateway");',
      '    var o = Activator.CreateInstance(t);',
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  // The FQN is a STRING literal — never a qualified_name node. No symbol hint can
  // resolve to MyApp.Payments.Gateway even if that type is in the table.
  const st = new SymbolTable();
  st.declare('csharp', 'MyApp.Payments.Gateway', 'src/pay/Gateway.cs');
  const owners = resolveAll(uses, st, (f) => (f === 'src/pay/Gateway.cs' ? 'pay' : undefined));
  expect(owners.every((o) => o === undefined)).toBe(true);
});
