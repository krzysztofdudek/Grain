import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);

test('emits the type FQN for a single-type import', async () => {
  const { uses } = await run('import com.acme.payments.PaymentService;\nclass C {}\n');
  expect(uses).toContainEqual(
    expect.objectContaining({
      candidates: [expect.objectContaining({ kind: 'path', specifier: 'com.acme.payments.PaymentService' })],
      kind: 'import',
    }),
  );
});
