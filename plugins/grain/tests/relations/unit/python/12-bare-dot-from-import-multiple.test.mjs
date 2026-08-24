import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('encodes bare-dot `from . import a, b` as `.a`, `.b`, and the package `.` itself', async () => {
  const { uses } = await run('from . import a, b');
  const s = specs(uses);
  expect(s).toContain('.a');
  expect(s).toContain('.b');
  expect(s).toContain('.'); // bare-dots package fallback (its __init__)
});
