import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('returns top-level class/interface/function names', async () => {
  const { declarations } = await run(`export class Foo {}\ninterface Bar {}\nfunction baz(){}`);
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('Foo');
  expect(keys).toContain('Bar');
  expect(keys).toContain('baz');
});
