import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage, SymbolTable, makeResolver } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

// Each case must resolve to nothing flaggable. We assert at the resolution layer:
// every emitted hint resolves to undefined (no in-graph owner) given a SymbolTable
// that knows only the consumer's own/family types.
const resolveAll = (uses, st, ownerOf) => {
  const resolver = makeResolver({
    ownerIndex: { ownerOf },
    symbolTable: st,
    resolvePathToFile: () => undefined,
  });
  // Walk each reference's WHOLE ordered group exactly as pass.ts does: the bound owner is
  // the first candidate that resolves (stop), or undefined if a nearer candidate is
  // ambiguous or nothing binds. A silence case must yield undefined for every group.
  return uses.map((u) => {
    for (const cand of u.candidates) {
      const outcome = resolver.classify(cand, 'src/c/Use.cs', 'csharp');
      if (outcome.kind === 'resolved') return outcome.ownerNode;
      if (outcome.kind === 'ambiguous') return undefined;
    }
    return undefined;
  });
};

test('DI-container registration emits NO cross-node flag (services.AddScoped<IFoo, Foo>())', async () => {
  const { uses } = await run(
    [
      'using Microsoft.Extensions.DependencyInjection;',
      'class Startup {',
      '  void Configure(IServiceCollection services) {',
      '    services.AddScoped<IFoo, Foo>();',
      '  }',
      '}',
      '',
    ].join('\n'),
  );
  // IFoo / Foo are bare type args → candidates Microsoft.Extensions.DependencyInjection.IFoo etc.
  // None is declared in a symbol table that maps to a node → all undefined.
  const owners = resolveAll(uses, new SymbolTable(), () => undefined);
  expect(owners.every((o) => o === undefined)).toBe(true);
});
