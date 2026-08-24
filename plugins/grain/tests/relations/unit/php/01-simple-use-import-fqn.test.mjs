import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);

test('emits the FQN for a simple use import', async () => {
  const { uses } = await run('<?php\nuse App\\Payment\\Gateway;\nclass C {}\n');
  expect(uses).toContainEqual(
    expect.objectContaining({
      candidates: [{ kind: 'path', specifier: 'App\\Payment\\Gateway' }],
      kind: 'import',
    }),
  );
});
