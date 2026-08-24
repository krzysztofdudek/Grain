import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the PACKAGE FQN for a wildcard import', async () => {
  const { uses } = await run('import com.acme.audit.*;\nclass C {}\n');
  const s = specs(uses);
  expect(s).toContain('com.acme.audit');
  // The package is the dependency — no `*`, no individual class.
  expect(s.every((x) => !x.includes('*'))).toBe(true);
});
