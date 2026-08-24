import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('javascript: detects require + import, no crash on no-type-syntax', async () => {
  const { uses } = await run(`import x from './x';\nconst y = require('./y');`, '.js', 'javascript');
  expect(uses).toHaveLength(2);
});
