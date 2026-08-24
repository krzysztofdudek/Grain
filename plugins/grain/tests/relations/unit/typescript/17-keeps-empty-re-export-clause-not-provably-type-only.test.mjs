import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('KEEPS an empty re-export clause (`export {} from`) — not provably type-only', async () => {
  // Zero specifiers: not provably a type-only construct, so the edge is conservatively kept.
  const { uses } = await run(`export {} from './empty';`);
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: './empty' }] }),
  );
});
