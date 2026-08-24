import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the OUTER common prefix once for a nested group `use crate::a::{b::{C, D}, e};`', async () => {
  // The outer group`s common module prefix `crate::a` already covers every leaf and
  // nested group under it, so it is emitted exactly once — the nested `b::{C, D}` is not
  // separately descended.
  const { uses } = await run('use crate::a::{b::{C, D}, e};');
  expect(specs(uses)).toEqual(['crate::a']);
});
