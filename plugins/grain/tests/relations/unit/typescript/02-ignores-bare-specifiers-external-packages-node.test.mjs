import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('ignores bare specifiers (external packages / node builtins)', async () => {
  const { uses } = await run(`import path from 'node:path';\nimport { z } from 'zod';`);
  expect(uses).toHaveLength(0);
});
