import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);

test('emits NOTHING for an import with an empty FQN (empty-specifier guard)', async () => {
  // `import ;` parses with an empty `identifier` (text ''), which the emit guard
  // discards as an empty specifier. No dependency edge.
  const { uses } = await run('import ;\nclass C {}\n');
  expect(uses).toHaveLength(0);
});
