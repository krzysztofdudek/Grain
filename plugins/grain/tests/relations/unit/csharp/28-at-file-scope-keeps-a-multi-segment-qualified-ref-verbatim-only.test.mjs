import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('at FILE SCOPE (no namespace, no using), keeps a multi-segment qualified ref VERBATIM only', async () => {
  // No enclosing namespace and no using prefix → `Foo.Bar.Baz` can ONLY mean top-level
  // Foo.Bar.Baz. It is unambiguous, so it stays a verbatim candidate (no expansion noise).
  const { uses } = await run(['class C { void M() { var o = new Foo.Bar.Baz(); } }', ''].join('\n'));
  const keys = symbolKeys(uses);
  expect(keys).toContain('Foo.Bar.Baz');
  // No spurious namespace/using expansion exists to emit.
  expect(keys).toEqual(['Foo.Bar.Baz']);
});
