// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin extractor — uses() emits SYMBOL hints (not path hints)')
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');
const run = (code) => runExtractor(kotlinExtractor, 'kotlin', '.kt', code);
const symbolKeys = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('emits the PACKAGE FQN for a wildcard import (documented v1: star → package, * dropped)', async () => {
  const { uses } = await run('import com.acme.audit.*\nclass C\n');
  const keys = symbolKeys(uses);
  // The `*` is a separate token; the qualified_identifier is already the package.
  expect(keys).toContain('com.acme.audit');
  expect(keys.every((k) => !k.includes('*'))).toBe(true);
});
