import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('gives a whole-statement export type re-export its edge (`export type { X } from`)', async () => {
  // `export type { X } from './m'` republishes a type of ./m: this module's surface
  // depends on it, so it is a dependency like a value re-export.
  const { uses } = await run(`export type { X } from './typeonly';\nexport { v } from './value';`);
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './typeonly' }], line: 1 }),
  );
  // The value re-export on the next line is unaffected.
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './value' }] }),
  );
});
