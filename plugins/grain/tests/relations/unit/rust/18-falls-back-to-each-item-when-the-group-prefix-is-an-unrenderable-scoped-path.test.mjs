import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('falls back to each item when the group prefix is an unrenderable scoped path `use ::foo::{Bar, Baz};`', async () => {
  // `::foo` renders to undefined (no leftmost segment), so the joined group prefix is
  // undefined → the fallback emits each item path (`Bar`, `Baz`) under an empty prefix.
  const { uses } = await run('use ::foo::{Bar, Baz};');
  expect(specs(uses).sort()).toEqual(['Bar', 'Baz']);
});
