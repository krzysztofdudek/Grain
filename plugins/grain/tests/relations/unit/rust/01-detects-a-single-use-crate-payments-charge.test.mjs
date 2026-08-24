import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);

test('detects a single `use crate::payments::charge;` as the crate-relative path hint', async () => {
  const { uses } = await run('use crate::payments::charge;');
  expect(uses).toContainEqual(
    expect.objectContaining({
      candidates: [{ kind: 'path', specifier: 'crate::payments::charge' }],
      kind: 'import',
    }),
  );
});
