import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);

test('emits NOTHING for a static import of a bare single segment (no type segment to keep)', async () => {
  // `import static Foo;` is a static import whose FQN is a single segment — dropping
  // the trailing member leaves nothing (dropLastSegment → undefined), so the emit
  // guard discards it. No dependency edge.
  const { uses } = await run('import static Foo;\nclass C {}\n');
  expect(uses).toHaveLength(0);
});
