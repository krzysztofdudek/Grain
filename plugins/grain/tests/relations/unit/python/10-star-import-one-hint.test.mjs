import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits ONE hint for the module on `from pkg import *` (no symbol enumeration)', async () => {
  const { uses } = await run('from pkg import *');
  const s = specs(uses);
  expect(s).toContain('pkg');
  // No `pkg.*` or enumerated-symbol candidates.
  expect(s.every((x) => !x.includes('*'))).toBe(true);
});
