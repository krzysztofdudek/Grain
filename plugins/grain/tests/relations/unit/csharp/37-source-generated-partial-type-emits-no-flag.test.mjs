import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('SOURCE-GENERATED / partial type emits NO flag (partial class, no base/new)', async () => {
  const { uses } = await run(['namespace App;', 'partial class Gen { }', ''].join('\n'));
  expect(symbolKeys(uses)).toHaveLength(0);
});
