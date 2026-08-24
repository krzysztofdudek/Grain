import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits a stdlib import FQN unchanged (silencing is the resolver job)', async () => {
  const { uses } = await run('import java.util.List;\nclass C {}\n');
  expect(specs(uses)).toContain('java.util.List');
});
