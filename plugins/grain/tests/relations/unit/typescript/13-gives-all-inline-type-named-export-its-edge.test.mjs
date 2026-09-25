import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('gives an all-inline-type named export its edge (`export { type A, type B } from`)', async () => {
  const { uses } = await run(`export { type A, type B } from './alltype';`);
  expect(uses.map((u) => u.candidates[0])).toEqual([{ kind: 'path', specifier: './alltype' }]);
});
