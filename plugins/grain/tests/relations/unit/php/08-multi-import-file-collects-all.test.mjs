import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('collects every import in a multi-import file', async () => {
  const { uses } = await run(
    ['<?php', 'namespace App\\App;', 'use App\\A\\Alpha;', 'use App\\B\\Beta;', 'class C {}', ''].join('\n'),
  );
  const s = specs(uses);
  expect(s).toContain('App\\A\\Alpha');
  expect(s).toContain('App\\B\\Beta');
});
