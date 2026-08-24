import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('encodes `from ..pkg.mod import y` as the dotted relative path', async () => {
  const { uses } = await run('from ..pkg.mod import y');
  const s = specs(uses);
  expect(s).toContain('..pkg.mod');
});
