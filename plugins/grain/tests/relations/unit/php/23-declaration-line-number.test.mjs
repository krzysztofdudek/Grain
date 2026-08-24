import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);

test('carries a 1-based line number for each declaration', async () => {
  const { declarations } = await run('<?php\n\nclass OnLineThree {}\n');
  const foo = declarations.find((d) => d.symbolKey === 'OnLineThree');
  expect(foo?.line).toBe(3);
});
