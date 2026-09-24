import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('resolves a backslash-LESS (namespace-relative) class name from the current namespace', async () => {
  // PHP has no global fallback for class names, so `new Sub\\Rel()` in `namespace App\\App` is App\\App\\Sub\\Rel — decided from the file alone; the resolver still needs the file.
  const { uses } = await run(
    ['<?php', 'namespace App\\App;', 'class C { function m() { $o = new Sub\\Rel(); } }', ''].join('\n'),
  );
  expect(specs(uses)).toEqual(['App\\App\\Sub\\Rel']);
});
