import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('qualifies a BARE `new Baz()` against EVERY using prefix (multiple candidates are safe)', async () => {
  const { uses } = await run(
    ['using Foo.Bar;', 'using Other.Ns;', 'class C { void M() { var x = new Baz(); } }', ''].join('\n'),
  );
  const keys = symbolKeys(uses);
  // Both candidates emitted — resolveUnique keeps only the one that actually resolves.
  expect(keys).toContain('Foo.Bar.Baz');
  expect(keys).toContain('Other.Ns.Baz');
});
