import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('deduplicates the same module repeated on one line (`import a.b, a.b`)', async () => {
  const { uses } = await run('import a.b, a.b');
  // Same specifier, same line → a single hint despite two clauses.
  expect(specs(uses).filter((x) => x === 'a.b')).toHaveLength(1);
});
