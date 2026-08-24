import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('go'), 'go', '.go', code);

test('returns each name in a grouped `type ( ... )` block', async () => {
  const { declarations } = await run(
    'package main\ntype (\n  A struct{}\n  B int\n)\n',
  );
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('A');
  expect(keys).toContain('B');
});
