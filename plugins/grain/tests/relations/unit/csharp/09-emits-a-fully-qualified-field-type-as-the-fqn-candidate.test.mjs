import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('emits a FULLY-QUALIFIED field type as the FQN candidate', async () => {
  const { uses } = await run(['class C { Foo.Bar.Dep _d; }', ''].join('\n'));
  expect(symbolKeys(uses)).toContain('Foo.Bar.Dep');
});
