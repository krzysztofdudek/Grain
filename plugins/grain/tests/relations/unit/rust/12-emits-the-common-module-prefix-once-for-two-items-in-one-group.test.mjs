import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the common module prefix ONCE for two items in one group', async () => {
  // `use crate::orders::{Order, Other};` — both leaves share prefix `crate::orders`,
  // which is emitted a single time (the group emits the common prefix, not each leaf).
  const { uses } = await run('use crate::orders::{Order, Other};');
  expect(specs(uses)).toEqual(['crate::orders']);
  expect(uses).toHaveLength(1);
});
