import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('handles a multi-clause single use (`use A\\X as P, B\\Y as Q;`) — both FQNs, no aliases', async () => {
  const { uses } = await run('<?php\nuse App\\A\\Alpha as X, App\\B\\Beta as Y;\nclass C {}\n');
  const s = specs(uses);
  expect(s).toContain('App\\A\\Alpha');
  expect(s).toContain('App\\B\\Beta');
  expect(s).not.toContain('App\\A\\X');
  expect(s).not.toContain('App\\B\\Y');
});
