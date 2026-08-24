import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('does NOT emit the namespace HEADER of a block `namespace Foo.Bar { }` as a use', async () => {
  // The qualified_name `Foo.Bar` is the namespace declaration name, not a dependency.
  const { uses, declarations } = await run(['namespace Foo.Bar { class C { } }', ''].join('\n'));
  expect(symbolKeys(uses)).not.toContain('Foo.Bar');
  expect(symbolKeys(uses)).toHaveLength(0);
  // The type is still declared with the namespace prefix.
  expect(declarations.map((d) => d.symbolKey)).toContain('Foo.Bar.C');
});
