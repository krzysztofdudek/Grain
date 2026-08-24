// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin extractor — uses() emits SYMBOL hints (not path hints)')
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');
const run = (code) => runExtractor(kotlinExtractor, 'kotlin', '.kt', code);
const symbolKeys = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('deduplicates two identical imports that begin on the same line', async () => {
  // Two `import a.B` statements on ONE line collide on the `<symbolKey> <line>` dedup
  // key — only one symbol hint is emitted (the seen-set true-arm).
  const { uses } = await run('import a.B;import a.B\nclass C\n');
  expect(symbolKeys(uses)).toEqual(['a.B']);
});
