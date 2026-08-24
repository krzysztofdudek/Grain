import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('excludes whole-statement import type', async () => {
  const { uses } = await run(`import type { T } from './t';\nimport { a } from './ab';`);
  expect(uses.some((u) => u.candidates[0].kind === 'path' && u.candidates[0].specifier === './t')).toBe(
    false,
  );
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './ab' }] }),
  );
});
