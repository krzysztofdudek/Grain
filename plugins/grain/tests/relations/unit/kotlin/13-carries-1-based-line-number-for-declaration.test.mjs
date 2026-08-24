// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin extractor — declarations() produce <package>.<Name> FQN keys')
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');
const run = (code) => runExtractor(kotlinExtractor, 'kotlin', '.kt', code);

test('carries a 1-based line number for each declaration', async () => {
  const { declarations } = await run('package p\n\nclass OnLineThree\n');
  const foo = declarations.find((d) => d.symbolKey === 'p.OnLineThree');
  expect(foo?.line).toBe(3);
});
