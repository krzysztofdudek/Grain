import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('go'), 'go', '.go', code);

test('returns top-level type, function, and method names', async () => {
  const { declarations } = await run(
    'package main\ntype Foo struct{}\nfunc Bar() {}\nfunc (r Foo) Method() {}\n',
  );
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('Foo');
  expect(keys).toContain('Bar');
  expect(keys).toContain('Method');
});
