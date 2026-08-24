import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the class FQN for a static-on-demand wildcard (asterisk wins over static)', async () => {
  // `import static com.foo.*;` carries BOTH a `static` token and an `asterisk` child.
  // The wildcard branch is checked first, so the scoped_identifier `com.foo` is
  // emitted as-is — the trailing member is NOT dropped.
  const { uses } = await run('import static com.foo.*;\nclass C {}\n');
  const s = specs(uses);
  expect(s).toContain('com.foo');
  expect(s.every((x) => !x.includes('*'))).toBe(true);
});
