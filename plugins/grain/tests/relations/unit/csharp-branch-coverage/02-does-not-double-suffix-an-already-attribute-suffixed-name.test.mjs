import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('does NOT double-suffix an already-`Attribute`-suffixed name `[FooAttribute]`', async () => {
  const { uses } = await run('namespace App;\n[RouteAttribute]\nclass Handler {}\n');
  const keys = symbolKeys(uses);
  expect(keys).toContain('RouteAttribute');
  // No `RouteAttributeAttribute` — the suffixed reading is suppressed when already suffixed.
  expect(keys).not.toContain('RouteAttributeAttribute');
});
