import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('inside a namespace, expands a multi-segment qualified ref against EACH using prefix too', async () => {
  // `new Models.Order()` inside `namespace App;` with `using Domain;` could mean
  // App.Models.Order, Domain.Models.Order, or top-level Models.Order — emit all three.
  const { uses } = await run(
    ['using Domain;', 'namespace App;', 'class C { void M() { var o = new Models.Order(); } }', ''].join('\n'),
  );
  const keys = symbolKeys(uses);
  expect(keys).toContain('App.Models.Order'); // enclosing-namespace expansion
  expect(keys).toContain('Domain.Models.Order'); // using-prefix expansion
  expect(keys).toContain('Models.Order'); // verbatim fallback
});
