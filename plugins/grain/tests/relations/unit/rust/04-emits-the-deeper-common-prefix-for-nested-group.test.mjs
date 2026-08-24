import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the deeper common prefix for `use crate::orders::{Order, sub::Deep};`', async () => {
  const { uses } = await run('use crate::orders::{Order, sub::Deep};');
  expect(specs(uses)).toEqual(['crate::orders']);
});
