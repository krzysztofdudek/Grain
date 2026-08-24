import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);
const hintFor = (uses, specifier) =>
  uses
    .map((u) => u.candidates[0])
    .find((h) => h.kind === 'path' && h.specifier === specifier);

test('does NOT tag a static-on-demand import as a package (the FQN is the class)', async () => {
  // `import static com.acme.util.Constants.*;` — the scoped_identifier IS the
  // class; the asterisk is static-on-demand, not a package wildcard.
  const { uses } = await run('import static com.acme.util.Constants.*;\nclass C {}\n');
  const h = hintFor(uses, 'com.acme.util.Constants');
  expect(h).toBeDefined();
  expect(h?.isPackage).toBeFalsy();
});
