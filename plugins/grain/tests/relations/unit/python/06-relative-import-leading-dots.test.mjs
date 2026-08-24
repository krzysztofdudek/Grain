import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('encodes relative imports with their leading dots', async () => {
  const { uses } = await run('from ..pkg import m');
  const s = specs(uses);
  expect(s).toContain('..pkg'); // the relative module
  expect(s).toContain('..pkg.m'); // submodule candidate
});
