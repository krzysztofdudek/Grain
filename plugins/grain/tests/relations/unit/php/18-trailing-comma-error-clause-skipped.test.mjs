import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('skips a trailing-comma error clause in a grouped use, keeping the valid one', async () => {
  // `use App\\{Foo, };` parses the dangling comma as an ERROR node that appears as a
  // named child of the group alongside the real clause; the non-clause child is skipped.
  const { uses } = await run('<?php\nuse App\\Grp\\{Foo, };\nclass C {}\n');
  const s = specs(uses);
  expect(s).toContain('App\\Grp\\Foo');
  expect(s).toHaveLength(1);
});
