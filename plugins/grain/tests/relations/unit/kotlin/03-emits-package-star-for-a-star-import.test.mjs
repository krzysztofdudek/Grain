// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin extractor — uses() emits SYMBOL hints (not path hints)')
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');
const run = (code) => runExtractor(kotlinExtractor, 'kotlin', '.kt', code);
const symbolKeys = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('emits `<package>.*` for a star import (the resolver collapses it by owner)', async () => {
  const { uses } = await run('import com.acme.audit.*\nimport com.acme.audit.Log\nclass C\n');
  const keys = symbolKeys(uses);
  // The `*` is a separate token; the qualified_identifier is the package, re-marked with `.*`.
  expect(keys).toContain('com.acme.audit.*');
  expect(keys).toContain('com.acme.audit.Log');
  expect(keys).not.toContain('com.acme.audit');
});
