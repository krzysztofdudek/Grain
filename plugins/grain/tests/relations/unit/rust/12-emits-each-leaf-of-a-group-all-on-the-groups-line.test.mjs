import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits each leaf of a group, all on the group`s line', async () => {
  // `use crate::orders::{Order, Other};` — each leaf resolves on its own (to the module file when it is an item of `crate::orders`); the pass collapses same-line edges to one node into one finding.
  const { uses } = await run('use crate::orders::{Order, Other};');
  expect(specs(uses)).toEqual(['crate::orders::Order', 'crate::orders::Other']);
  // upstream asserts `new Set(lines)` equals `new Set([1])`; the harness cannot compare Sets, so the distinct lines are compared as an array
  expect([...new Set(uses.map(u => u.line))]).toEqual([1]);
});
