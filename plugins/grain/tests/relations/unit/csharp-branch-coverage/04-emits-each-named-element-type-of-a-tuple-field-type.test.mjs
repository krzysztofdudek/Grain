import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('emits each NAMED element type of a tuple field type', async () => {
  const { uses } = await run(
    'namespace App;\nclass C {\n  (int, Models.Customer) Pair;\n}\n',
  );
  const keys = symbolKeys(uses);
  // `int` is a predefined type (no dep); the named element is a dependency.
  expect(keys).toContain('Models.Customer');
});
