import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('detects re-exports with a source (not local exports)', async () => {
  const { uses } = await run(
    `export { re } from './reexp';\nexport * from './star';\nexport const local = 1;`,
  );
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './reexp' }] }),
  );
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './star' }] }),
  );
  expect(uses).toHaveLength(2);
});
