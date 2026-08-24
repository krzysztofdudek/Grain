// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin extractor — declarations() produce <package>.<Name> FQN keys')
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');
const run = (code) => runExtractor(kotlinExtractor, 'kotlin', '.kt', code);

test('emits NO key for a destructuring property declaration (no single name)', async () => {
  // `val (a, b) = pair` nests a `multi_variable_declaration`, not a
  // `variable_declaration`; v1 indexes only the single-name form, so declarationName
  // yields nothing and the declaration is skipped — no symbol key for a or b.
  const { declarations } = await run('package com.acme.app\nval (a, b) = pair\n');
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).not.toContain('com.acme.app.a');
  expect(keys).not.toContain('com.acme.app.b');
});
