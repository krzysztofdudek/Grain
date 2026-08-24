import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

test('uses the BARE type name when the type is at FILE SCOPE (no namespace)', async () => {
  const { declarations } = await run('class Loose { }\n');
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('Loose');
  expect(keys.every((k) => !k.startsWith('.'))).toBe(true);
});
