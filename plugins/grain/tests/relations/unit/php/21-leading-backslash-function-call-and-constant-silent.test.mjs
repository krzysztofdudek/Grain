import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);

test('does NOT emit a leading-backslash FUNCTION call or bare constant (not class autoloading)', async () => {
  // `\\App\\Util\\format()` is a function call and `\\App\\C\\FOO` a bare constant; PHP keeps
  // functions/constants in separate namespaces resolved at call time, never PSR-4 class files,
  // so emitting them could bind an unrelated class file — excluded for zero false positives.
  const { uses } = await run(
    ['<?php', 'namespace App\\App;', 'function m() { \\App\\Util\\format(); $x = \\App\\C\\FOO; }', ''].join('\n'),
  );
  expect(uses).toHaveLength(0);
});
