import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('go'), 'go', '.go', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('deduplicates two identical import specs on the same line', async () => {
  // Two `"a/b"` specs starting on ONE line collide on the `<specifier> <line>` dedup
  // key — only one hint survives (the seen-set true-arm).
  const { uses } = await run('package main\nimport "a/b"; import "a/b"\n');
  expect(specs(uses)).toEqual(['a/b']);
});
