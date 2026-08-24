import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('drops only the function clause in a mixed grouped use, keeping the class (`{function format, Gateway}`)', async () => {
  // Per-clause `function` token: the group mixes a function import and a class
  // import. Only the class is a dependency edge; the function must be silenced
  // without taking the class down with it.
  const { uses } = await run('<?php\nuse App\\Pkg\\{function format, Gateway};\nclass C {}\n');
  const s = specs(uses);
  expect(s).toContain('App\\Pkg\\Gateway');
  expect(s).not.toContain('App\\Pkg\\format');
  expect(s).toHaveLength(1);
});
