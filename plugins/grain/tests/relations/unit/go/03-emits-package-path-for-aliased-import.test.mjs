import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('go'), 'go', '.go', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the package PATH for an aliased import (the alias is irrelevant)', async () => {
  const { uses } = await run('package main\nimport alias "c/d"\n');
  const s = specs(uses);
  expect(s).toContain('c/d');
  expect(s).not.toContain('alias');
});
