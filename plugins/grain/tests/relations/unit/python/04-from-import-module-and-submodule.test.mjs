import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the module (and submodule candidate) for `from a.b import c`', async () => {
  const { uses } = await run('from a.b import c');
  const s = specs(uses);
  expect(s).toContain('a.b'); // the package/module edge
  expect(s).toContain('a.b.c'); // longest-match submodule candidate
});
