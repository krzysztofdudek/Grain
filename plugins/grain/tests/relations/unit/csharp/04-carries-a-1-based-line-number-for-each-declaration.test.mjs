import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

test('carries a 1-based line number for each declaration', async () => {
  const { declarations } = await run('namespace N;\n\npublic class OnLineThree { }\n');
  const found = declarations.find((d) => d.symbolKey === 'N.OnLineThree');
  expect(found?.line).toBe(3);
});
