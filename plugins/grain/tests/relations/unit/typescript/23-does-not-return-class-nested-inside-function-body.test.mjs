import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('does NOT return a class nested inside a function body', async () => {
  const { declarations } = await run(`function outer(){ class Inner {} }`);
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('outer');
  expect(keys).not.toContain('Inner');
});
