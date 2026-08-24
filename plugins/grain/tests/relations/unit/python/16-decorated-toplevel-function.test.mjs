import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

test('includes a decorated top-level function', async () => {
  const { declarations } = await run('@deco\ndef baz():\n    pass\n');
  expect(declarations.map((d) => d.symbolKey)).toContain('baz');
});
