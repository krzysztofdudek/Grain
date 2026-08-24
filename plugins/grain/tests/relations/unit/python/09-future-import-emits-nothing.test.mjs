import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

test('emits NOTHING for `from __future__ import annotations`', async () => {
  const { uses } = await run('from __future__ import annotations');
  expect(uses).toHaveLength(0);
});
