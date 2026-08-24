import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('drops the function clause regardless of its position in the group (`{Gateway, function format}`)', async () => {
  // Class-first ordering — guard must be evaluated per clause, not by position.
  const { uses } = await run('<?php\nuse App\\Pkg\\{Gateway, function format};\nclass C {}\n');
  const s = specs(uses);
  expect(s).toContain('App\\Pkg\\Gateway');
  expect(s).not.toContain('App\\Pkg\\format');
  expect(s).toHaveLength(1);
});
