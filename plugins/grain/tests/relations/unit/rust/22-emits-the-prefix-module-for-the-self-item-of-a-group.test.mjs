import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the prefix module for the `self` item of a group `use crate::a::{self, B};`', async () => {
  // The `self` leaf means the prefix module itself; `B` resolves on its own.
  const { uses } = await run('use crate::a::{self, B};');
  expect(specs(uses)).toEqual(['crate::a', 'crate::a::B']);
});
