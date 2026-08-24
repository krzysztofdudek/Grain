import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the bare segment of a single-segment import (identifier child, not scoped_identifier)', async () => {
  // `import Foo;` parses with an `identifier` child (no dots) — exercises the
  // `identifier` arm of importFqn. The FQN is the bare segment itself.
  const { uses } = await run('import Foo;\nclass C {}\n');
  expect(specs(uses)).toContain('Foo');
});
