// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin extractor — uses() emits SYMBOL hints (not path hints)')
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');
const run = (code) => runExtractor(kotlinExtractor, 'kotlin', '.kt', code);

test('emits the imported FQN as a symbol hint for a single-type import', async () => {
  const { uses } = await run('package com.acme.app\nimport com.acme.payments.PaymentService\nclass C\n');
  expect(uses).toContainEqual(
    expect.objectContaining({
      candidates: [{ kind: 'symbol', symbolKey: 'com.acme.payments.PaymentService' }],
      kind: 'import',
    }),
  );
  // It must NOT be a path hint — Kotlin resolves through the SymbolTable.
  expect(uses.every((u) => u.candidates[0].kind === 'symbol')).toBe(true);
});
