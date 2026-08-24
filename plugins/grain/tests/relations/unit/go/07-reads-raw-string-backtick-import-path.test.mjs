import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('go'), 'go', '.go', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('reads a raw-string (backtick) import path', async () => {
  const { uses } = await run('package main\nimport `example.com/m/raw`\n');
  expect(specs(uses)).toContain('example.com/m/raw');
});
