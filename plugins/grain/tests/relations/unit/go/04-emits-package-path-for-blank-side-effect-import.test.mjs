import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('go'), 'go', '.go', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the package PATH for a blank (side-effect) import `_ "drv"`', async () => {
  const { uses } = await run('package main\nimport _ "example.com/m/drv"\n');
  expect(specs(uses)).toContain('example.com/m/drv');
});
