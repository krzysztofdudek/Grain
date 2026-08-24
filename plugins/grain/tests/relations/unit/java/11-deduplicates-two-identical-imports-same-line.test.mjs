import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('deduplicates two identical imports that begin on the same line', async () => {
  // Two `import a.B;` declarations on ONE line collide on the `<specifier> <line>`
  // dedup key — only one edge is emitted (the seen-set true-arm).
  const { uses } = await run('import a.B; import a.B;\nclass C {}\n');
  const s = specs(uses);
  expect(s).toEqual(['a.B']);
});
