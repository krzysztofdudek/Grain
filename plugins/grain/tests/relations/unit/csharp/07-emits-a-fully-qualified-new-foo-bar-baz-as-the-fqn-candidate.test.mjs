import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('emits a FULLY-QUALIFIED `new Foo.Bar.Baz()` as the FQN candidate', async () => {
  const { uses } = await run(
    ['class C { void M() { var o = new Foo.Bar.Baz(); } }', ''].join('\n'),
  );
  expect(symbolKeys(uses)).toContain('Foo.Bar.Baz');
  expect(uses.every((u) => u.candidates[0].kind === 'symbol')).toBe(true);
});
