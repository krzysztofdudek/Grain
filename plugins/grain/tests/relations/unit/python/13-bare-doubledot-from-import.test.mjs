import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('encodes bare double-dot `from .. import x` as `..x` and the parent package `..`', async () => {
  const { uses } = await run('from .. import x');
  const s = specs(uses);
  expect(s).toContain('..x');
  expect(s).toContain('..');
});
