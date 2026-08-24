import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('KEEPS a mixed inline-type export re-export (`export { type A, b } from`)', async () => {
  // `b` is a runtime re-export → exactly one edge survives.
  const { uses } = await run(`export { type A, b } from './mixed';`);
  expect(
    uses.filter((u) => u.candidates[0].kind === 'path' && u.candidates[0].specifier === './mixed'),
  ).toHaveLength(1);
});
