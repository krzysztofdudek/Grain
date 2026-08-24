import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('excludes a whole-statement namespace type import (`import type * as T from ...`)', async () => {
  const { uses } = await run(`import type * as T from './t';\nimport { a } from './ab';`);
  expect(uses.some((u) => u.candidates[0].kind === 'path' && u.candidates[0].specifier === './t')).toBe(
    false,
  );
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './ab' }] }),
  );
});
