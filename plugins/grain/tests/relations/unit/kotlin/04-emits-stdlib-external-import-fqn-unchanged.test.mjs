// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin extractor — uses() emits SYMBOL hints (not path hints)')
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');
const run = (code) => runExtractor(kotlinExtractor, 'kotlin', '.kt', code);
const symbolKeys = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('emits a stdlib/external import FQN unchanged (silencing is the SymbolTable job)', async () => {
  const { uses } = await run('import kotlin.collections.List\nimport java.util.ArrayList\nclass C\n');
  const keys = symbolKeys(uses);
  expect(keys).toContain('kotlin.collections.List');
  expect(keys).toContain('java.util.ArrayList');
});
