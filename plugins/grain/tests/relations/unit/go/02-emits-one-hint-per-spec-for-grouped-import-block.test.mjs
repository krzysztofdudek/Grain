import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('go'), 'go', '.go', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits one hint per spec for a grouped import block', async () => {
  const { uses } = await run('package main\nimport (\n  "a/b"\n  "c/d/e"\n)\n');
  const s = specs(uses);
  expect(s).toContain('a/b');
  expect(s).toContain('c/d/e');
  expect(s).toHaveLength(2);
});
