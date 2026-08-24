import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('detects a no-substitution template-literal dynamic import() and require(), still skips interpolated', async () => {
  // A backtick specifier with no `${…}` is static and statically resolvable — TS/esbuild/Node
  // treat it identically to a quoted string — so it must yield an edge. An INTERPOLATED
  // template literal stays non-static and skipped.
  const { uses } = await run(
    'const a = import(`./a`);\nconst b = require(`./b`);\nconst c = import(`./x-${v}`);',
  );
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './a' }] }),
  );
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './b' }] }),
  );
  expect(uses.filter((u) => u.candidates[0].kind === 'path')).toHaveLength(2);
});
