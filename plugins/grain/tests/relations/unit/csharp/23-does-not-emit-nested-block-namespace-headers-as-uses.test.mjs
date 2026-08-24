import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('does NOT emit NESTED block namespace headers as uses (namespace A.B { namespace C.D { } })', async () => {
  const { uses, declarations } = await run(
    ['namespace A.B { namespace C.D { class X { } } }', ''].join('\n'),
  );
  expect(symbolKeys(uses)).toHaveLength(0);
  expect(declarations.map((d) => d.symbolKey)).toContain('A.B.C.D.X');
});
