import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('uses the real module of `import x as y`, never the alias', async () => {
  const { uses } = await run('import numpy as np');
  const s = specs(uses);
  expect(s).toContain('numpy');
  expect(s).not.toContain('np');
});
