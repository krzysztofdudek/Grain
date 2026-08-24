import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('uses the real symbol of an aliased name in `from a.b import c as d, e`', async () => {
  const { uses } = await run('from a.b import c as d, e');
  const s = specs(uses);
  expect(s).toContain('a.b'); // module edge
  expect(s).toContain('a.b.c'); // aliased symbol → real name, not the alias `d`
  expect(s).toContain('a.b.e'); // plain symbol
  expect(s).not.toContain('a.b.d');
});
