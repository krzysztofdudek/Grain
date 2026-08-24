import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);
const hintFor = (uses, specifier) =>
  uses
    .map((u) => u.candidates[0])
    .find((h) => h.kind === 'path' && h.specifier === specifier);

test('tags the wildcard package hint with isPackage: true', async () => {
  const { uses } = await run('import com.acme.audit.*;\nclass C {}\n');
  const h = hintFor(uses, 'com.acme.audit');
  expect(h).toBeDefined();
  expect(h?.isPackage).toBe(true);
});
