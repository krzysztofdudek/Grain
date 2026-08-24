// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin extractor — declarations() produce <package>.<Name> FQN keys')
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');
const run = (code) => runExtractor(kotlinExtractor, 'kotlin', '.kt', code);

test('uses the BARE name when the file has no package_header (root package / .kts)', async () => {
  const { declarations } = await run('class Foo\nfun bar() {}\n');
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('Foo');
  expect(keys).toContain('bar');
  expect(keys.every((k) => !k.startsWith('.'))).toBe(true);
});
