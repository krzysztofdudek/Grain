import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('KEEPS a namespace export re-export (`export * as ns from`) — never type-only', async () => {
  // `export type * as` is not valid TS; a namespace re-export is always a runtime edge.
  const { uses } = await run(`export * as ns from './ns';`);
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './ns' }] }),
  );
});
