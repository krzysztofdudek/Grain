import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('joins each item to the deeper prefix `use crate::orders::{Order, sub::Deep};`', async () => {
  // A path item (`sub::Deep`) names its own module, never the prefix module.
  const { uses } = await run('use crate::orders::{Order, sub::Deep};');
  expect(specs(uses)).toEqual(['crate::orders::Order', 'crate::orders::sub::Deep']);
});
