import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('reads a generic attribute `[Foo<Bar>]` as the base name plus each type argument', async () => {
  const { uses } = await run('namespace App;\n[Validate<Models.Customer>]\nclass Handler {}\n');
  const keys = symbolKeys(uses);
  // Base container name resolves the attribute class (verbatim + suffixed reading).
  expect(keys).toContain('Validate');
  expect(keys).toContain('ValidateAttribute');
  // Each generic type ARGUMENT is its own real type reference.
  expect(keys).toContain('Models.Customer');
});
