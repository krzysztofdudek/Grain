import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('`using static X;` emits the fully-qualified TARGET as a sole candidate, NO namespace-prefix expansion', async () => {
  const { uses } = await run(
    ['using static MyApp.Math.Calc;', 'class C { void M() { var r = Compute(); } }', ''].join('\n'),
  );
  // The static-using TARGET `MyApp.Math.Calc` IS a real, fully-qualified type dependency: it is
  // emitted as a ONE-candidate group (no enclosing-ns / using-prefix expansion), so it resolves
  // only when MyApp.Math.Calc is in-graph (external here → silence). Crucially the directive adds
  // NO namespace prefix: `Compute()` (a bare invocation) yields no hint, and no sibling
  // `MyApp.Math.<other>` candidate is ever invented.
  const target = uses.find((u) => u.candidates.some((c) => c.kind === 'symbol' && c.symbolKey === 'MyApp.Math.Calc'));
  expect(target).toBeDefined();
  expect(target.candidates).toHaveLength(1); // sole verbatim/FQN candidate, no expansion
  // The ONLY `MyApp.Math.*` key is the target itself — never a sibling-namespace expansion.
  expect(symbolKeys(uses).filter((k) => k.startsWith('MyApp.Math'))).toEqual(['MyApp.Math.Calc']);
});
