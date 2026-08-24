import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('excludes an all-inline-type named import (`import { type A, type B } from`)', async () => {
  // Every specifier carries `type`; no default/namespace binding remains at runtime.
  const { uses } = await run(`import { type A, type B } from './alltype';`);
  expect(uses).toHaveLength(0);
});
