import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('drops the trailing member of a static import (emits the type FQN)', async () => {
  const { uses } = await run('import static com.acme.util.Helpers.format;\nclass C {}\n');
  const s = specs(uses);
  expect(s).toContain('com.acme.util.Helpers');
  expect(s).not.toContain('com.acme.util.Helpers.format');
});
