import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);

test('does NOT emit a backslash-LESS (namespace-relative) inline reference — needs namespace+use context', async () => {
  // `new Sub\\Rel()` and a bare `Rel` are relative to the current namespace / use aliases; a
  // source-only tool cannot bind them, so they stay silent (recall miss, never an FP).
  const { uses } = await run(
    ['<?php', 'namespace App\\App;', 'class C { function m() { $o = new Sub\\Rel(); } }', ''].join('\n'),
  );
  expect(uses).toHaveLength(0);
});
