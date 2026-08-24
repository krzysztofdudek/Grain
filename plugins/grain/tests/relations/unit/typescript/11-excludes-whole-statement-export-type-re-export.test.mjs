import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('excludes a whole-statement export type re-export (`export type { X } from`)', async () => {
  // `export type { X } from './m'` carries a statement-level `type` token before the
  // export_clause — a compile-time-only re-export, NOT a runtime dependency.
  const { uses } = await run(`export type { X } from './typeonly';\nexport { v } from './value';`);
  expect(
    uses.some((u) => u.candidates[0].kind === 'path' && u.candidates[0].specifier === './typeonly'),
  ).toBe(false);
  // The value re-export on the next line is unaffected.
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './value' }] }),
  );
});
