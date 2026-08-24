import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('strips a leading backslash from a fully-qualified use', async () => {
  const { uses } = await run('<?php\nuse \\App\\Payment\\Gateway;\nclass C {}\n');
  const s = specs(uses);
  expect(s).toContain('App\\Payment\\Gateway');
  expect(s.every((x) => !x.startsWith('\\'))).toBe(true);
});
