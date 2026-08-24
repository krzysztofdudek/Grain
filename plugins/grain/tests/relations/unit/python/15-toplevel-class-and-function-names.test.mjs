import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

test('returns top-level class and function names', async () => {
  const { declarations } = await run('class Foo:\n    pass\n\ndef bar():\n    pass\n');
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('Foo');
  expect(keys).toContain('bar');
});
