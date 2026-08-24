import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('harvests a named type embedded in an alias RHS ARRAY', async () => {
  const { uses } = await run('using A = App.Models.Row[];\nclass C {}\n');
  const keys = symbolKeys(uses);
  expect(keys).toContain('App.Models.Row');
});
