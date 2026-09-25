import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('gives a whole-statement namespace type import its edge (`import type * as T from ...`)', async () => {
  const { uses } = await run(`import type * as T from './t';\nimport { a } from './ab';`);
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './t' }], line: 1 }),
  );
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './ab' }] }),
  );
});
