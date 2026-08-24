import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);

test('emits NOTHING for a module import declaration `import module M;` (JEP 511)', async () => {
  // A module import names a MODULE, not a type/package; its imported set lives in
  // unreadable module-path metadata. The extractor recognizes the `module` soft keyword
  // (or, in the pre-JEP-511 grammar, the malformed leading-`module` scoped_identifier)
  // and emits no hint — and the whitespace-validity backstop drops the malformed
  // `"module …"` pseudo-FQN even if recognition were bypassed.
  const { uses } = await run('package com.app;\nimport module java.base;\nimport module com.acme.lib;\nclass C {}\n');
  expect(uses).toHaveLength(0);
});
