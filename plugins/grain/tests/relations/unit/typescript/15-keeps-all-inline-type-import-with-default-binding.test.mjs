import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('KEEPS an all-inline-type import that still has a default binding (`import def, { type A } from`)', async () => {
  // The default `def` is a runtime binding even though every named specifier is type-only.
  const { uses } = await run(`import def, { type A } from './withdefault';`);
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './withdefault' }] }),
  );
});
