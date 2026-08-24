// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin extractor — declarations() produce <package>.<Name> FQN keys')
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');
const run = (code) => runExtractor(kotlinExtractor, 'kotlin', '.kt', code);

test('indexes a modifier-prefixed property (skips the leading non-variable_declaration child)', async () => {
  // `const val PI = 3` puts a `modifiers` node before the `variable_declaration`, so
  // the property loop skips the first named child (it is not a variable_declaration)
  // before finding the name. The FQN is still emitted.
  const { declarations } = await run('package com.acme.app\nconst val PI = 3\n');
  expect(declarations.map((d) => d.symbolKey)).toContain('com.acme.app.PI');
});
