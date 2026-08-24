import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);

test('skips a grouped function import (`use function Base\\{a, b};`)', async () => {
  // The `function` token sits as a DIRECT child of the declaration here, not on
  // the clause — the whole grouped declaration imports functions, not classes.
  const { uses } = await run('<?php\nuse function App\\Util\\{format, trim};\nclass C {}\n');
  expect(uses).toHaveLength(0);
});
