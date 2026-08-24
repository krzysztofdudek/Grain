import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('keeps the class FQN intact for a static-on-demand import', async () => {
  // `import static com.acme.util.Constants.*;` — the FQN IS the class.
  const { uses } = await run('import static com.acme.util.Constants.*;\nclass C {}\n');
  const s = specs(uses);
  expect(s).toContain('com.acme.util.Constants');
  expect(s.every((x) => !x.includes('*'))).toBe(true);
});
