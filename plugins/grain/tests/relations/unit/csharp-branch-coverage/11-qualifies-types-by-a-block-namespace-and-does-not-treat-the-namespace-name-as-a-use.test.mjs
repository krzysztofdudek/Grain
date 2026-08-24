import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('qualifies types by a BLOCK namespace and does not treat the namespace name as a use', async () => {
  const { declarations, uses } = await run(
    'namespace App.Services {\n  class Handler {\n    Models.Customer C;\n  }\n}\n',
  );
  // The declared type is namespace-qualified from the block namespace.
  expect(declarations.map((d) => d.symbolKey)).toContain('App.Services.Handler');
  // The namespace NAME `App.Services` is not emitted as a dependency; the field type is.
  const keys = symbolKeys(uses);
  expect(keys).not.toContain('App.Services');
  expect(keys.some((k) => k.endsWith('Models.Customer'))).toBe(true);
});
