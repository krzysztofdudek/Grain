// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin extractor — uses() emits SYMBOL hints (not path hints)')
import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');
const run = (code) => runExtractor(kotlinExtractor, 'kotlin', '.kt', code);
const symbolKeys = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'symbol' ? [u.candidates[0].symbolKey] : []));

test('collects every import in a multi-import file', async () => {
  const { uses } = await run(
    ['package com.acme.app', 'import com.acme.a.Alpha', 'import com.acme.b.Beta', 'class C', ''].join('\n'),
  );
  const keys = symbolKeys(uses);
  expect(keys).toContain('com.acme.a.Alpha');
  expect(keys).toContain('com.acme.b.Beta');
});
