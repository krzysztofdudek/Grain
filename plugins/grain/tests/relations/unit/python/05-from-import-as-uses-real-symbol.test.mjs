import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('uses the real symbol of `from a.b import c as d`, never the alias', async () => {
  const { uses } = await run('from a.b import c as d');
  const s = specs(uses);
  expect(s).toContain('a.b');
  expect(s).toContain('a.b.c');
  expect(s).not.toContain('a.b.d');
});
