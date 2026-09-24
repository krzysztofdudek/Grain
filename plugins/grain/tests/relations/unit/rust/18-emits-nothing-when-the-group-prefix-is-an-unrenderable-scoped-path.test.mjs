import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits nothing when the group prefix is an unrenderable scoped path `use ::foo::{Bar, Baz};`', async () => {
  // `::foo` renders to undefined (no leftmost segment). Emitting the items bare (`Bar`, `Baz`) would re-root them at the top level, where a bare name can match an in-repo path dependency the code never named → silence over a guess.
  const { uses } = await run('use ::foo::{Bar, Baz};');
  expect(specs(uses)).toEqual([]);
});
