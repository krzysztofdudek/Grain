import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);
const hintFor = (uses, specifier) =>
  uses
    .map((u) => u.candidates[0])
    .find((h) => h.kind === 'path' && h.specifier === specifier);

test('does NOT tag a single-type import as a package', async () => {
  const { uses } = await run('import com.acme.payments.PaymentService;\nclass C {}\n');
  const h = hintFor(uses, 'com.acme.payments.PaymentService');
  expect(h).toBeDefined();
  expect(h?.isPackage).toBeFalsy();
});
