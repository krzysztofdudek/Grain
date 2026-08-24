import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('drops only the const clause in a mixed grouped use, keeping the class (`{const MAX, Gateway}`)', async () => {
  // Per-clause `const` token — same rule as `function`.
  const { uses } = await run('<?php\nuse App\\Pkg\\{const MAX, Gateway};\nclass C {}\n');
  const s = specs(uses);
  expect(s).toContain('App\\Pkg\\Gateway');
  expect(s).not.toContain('App\\Pkg\\MAX');
  expect(s).toHaveLength(1);
});
