import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);

test('emits nothing for a use whose only name is a bare backslash (`use \\;`)', async () => {
  // qualified_name text is "\\"; stripping the single leading backslash leaves the
  // empty string, which the emit guard rejects.
  const { uses } = await run('<?php\nuse \\;\nclass C {}\n');
  expect(uses).toHaveLength(0);
});
