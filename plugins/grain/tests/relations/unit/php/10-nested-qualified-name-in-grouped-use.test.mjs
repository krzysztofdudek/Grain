import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const phpExtractor = extractorForLanguage('php');
const run = (code) => runExtractor(phpExtractor, 'php', '.php', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('resolves a nested qualified_name segment inside a grouped use (`{Inner\\Deep, Plain}`)', async () => {
  const { uses } = await run('<?php\nuse App\\Sub\\{Inner\\Deep, Plain};\nclass C {}\n');
  const s = specs(uses);
  expect(s).toContain('App\\Sub\\Inner\\Deep');
  expect(s).toContain('App\\Sub\\Plain');
});
