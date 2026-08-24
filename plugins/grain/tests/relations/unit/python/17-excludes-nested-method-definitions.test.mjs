import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

test('does NOT return nested (method / inner) definitions', async () => {
  const { declarations } = await run('class Outer:\n    def method(self):\n        pass\n');
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('Outer');
  expect(keys).not.toContain('method');
});
