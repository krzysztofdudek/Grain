import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);

test('skips function and const imports (not class dependencies)', async () => {
  const { uses } = await run(
    ['<?php', 'use function App\\Util\\format;', 'use const App\\Util\\MAX;', 'class C {}', ''].join('\n'),
  );
  expect(uses).toHaveLength(0);
});
