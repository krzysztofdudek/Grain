import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

test('does NOT return a class nested under a non-module block (`if ...:` body)', async () => {
  // The class_definition is parented by a `block`, not `module`, so isTopLevel
  // rejects it — exercises the non-top-level rejection path.
  const { declarations } = await run('if True:\n    class Cond:\n        pass\n');
  expect(declarations.map((d) => d.symbolKey)).not.toContain('Cond');
});
