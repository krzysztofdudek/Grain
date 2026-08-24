import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('emits a QUALIFIED base type (`: Foo.Bar.Base`) even with NO using directive', async () => {
  // A qualified_name in a base_list is emitted as-is (not via the bare prefix path).
  const { uses } = await run(['class C : Foo.Bar.Base { }', ''].join('\n'));
  expect(symbolKeys(uses)).toContain('Foo.Bar.Base');
});
