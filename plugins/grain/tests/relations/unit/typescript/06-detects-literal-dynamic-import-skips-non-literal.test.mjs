import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('detects literal dynamic import, skips non-literal', async () => {
  const { uses } = await run(
    "const d = import('./d');\nconst e = import(`./x-${v}`);\nconst f = import(v);",
  );
  expect(uses.filter((u) => u.candidates[0].kind === 'path')).toHaveLength(1);
  expect(uses[0].candidates[0]).toEqual({ kind: 'path', specifier: './d' });
});
