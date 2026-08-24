import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the FQN of a nested-type import verbatim', async () => {
  const { uses } = await run('import com.foo.Outer.Inner;\nclass C {}\n');
  expect(specs(uses)).toContain('com.foo.Outer.Inner');
});
