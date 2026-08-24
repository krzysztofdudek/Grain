import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('expands a grouped use into one FQN per imported class', async () => {
  const { uses } = await run('<?php\nuse App\\Payment\\{Charge, Refund};\nclass C {}\n');
  const s = specs(uses);
  expect(s).toContain('App\\Payment\\Charge');
  expect(s).toContain('App\\Payment\\Refund');
});
