import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits a vendor/external import FQN unchanged (silencing is the resolver job)', async () => {
  const { uses } = await run('<?php\nuse Psr\\Log\\LoggerInterface;\nclass C {}\n');
  expect(specs(uses)).toContain('Psr\\Log\\LoggerInterface');
});
