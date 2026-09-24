import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('descends a nested group with the accumulated prefix `use crate::a::{b::{C, D}, e};`', async () => {
  const { uses } = await run('use crate::a::{b::{C, D}, e};');
  expect(specs(uses)).toEqual(['crate::a::b::C', 'crate::a::b::D', 'crate::a::e']);
});
