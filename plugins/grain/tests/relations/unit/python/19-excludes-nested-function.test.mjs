import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

test('does NOT return a function nested inside another function', async () => {
  const { declarations } = await run('def outer():\n    def inner():\n        pass\n');
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('outer');
  expect(keys).not.toContain('inner');
});
