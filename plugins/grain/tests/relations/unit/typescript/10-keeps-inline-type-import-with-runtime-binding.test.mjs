import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('keeps an inline-type import that still has a runtime binding (`import { type A, b }`)', async () => {
  // The `type` modifier sits inside the specifier, not as a statement-level token,
  // so the statement is NOT a whole-statement type import and must be kept.
  const { uses } = await run(`import { type A, b } from './m';`);
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './m' }] }),
  );
});
