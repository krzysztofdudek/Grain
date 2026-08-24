import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('detects multiple modules in one `import a, b.c`', async () => {
  const { uses } = await run('import a, b.c');
  const s = specs(uses);
  expect(s).toContain('a');
  expect(s).toContain('b.c');
});
