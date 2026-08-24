import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

const groupContaining = (uses, key) => {
  const dep = uses.find((u) => u.candidates.some((c) => c.kind === 'symbol' && c.symbolKey === key));
  return dep?.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : []));
};

test('emits BOTH the verbatim and the `Attribute`-suffixed reading for `[Foo]`', async () => {
  const { uses } = await run('namespace App;\n[Route]\nclass Handler {}\n');
  const keys = symbolKeys(uses);
  // The C# convention: `[Route]` may name `Route` OR `RouteAttribute`.
  expect(keys).toContain('Route');
  expect(keys).toContain('RouteAttribute');
  // Both readings live in ONE ordered group (an attribute is a single dependency).
  const group = groupContaining(uses, 'Route');
  expect(group).toContain('Route');
  expect(group).toContain('RouteAttribute');
});
