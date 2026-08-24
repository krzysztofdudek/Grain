import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

const groupContaining = (uses, key) => {
  const dep = uses.find((u) => u.candidates.some((c) => c.kind === 'symbol' && c.symbolKey === key));
  return dep?.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : []));
};

test('resolves a `global::A.B.C` reference from the root as its sole candidate', async () => {
  const { uses } = await run('namespace App;\nclass C {\n  global::Other.Models.User U;\n}\n');
  const keys = symbolKeys(uses);
  // The `global::` qualifier is stripped; the clean FQN is the reference.
  expect(keys).toContain('Other.Models.User');
  // A rooted reference resolves verbatim only — no enclosing-ns/using expansion candidates.
  const group = groupContaining(uses, 'Other.Models.User');
  expect(group).toEqual(['Other.Models.User']);
});
