import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('gives whole-statement import type its edge (a type-only import is a dependency)', async () => {
  const { uses } = await run(`import type { T } from './t';\nimport { a } from './ab';`);
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './t' }], line: 1 }),
  );
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './ab' }] }),
  );
});
