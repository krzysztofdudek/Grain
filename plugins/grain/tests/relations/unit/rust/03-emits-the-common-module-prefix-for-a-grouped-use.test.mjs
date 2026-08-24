import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the common module prefix for a grouped `use crate::{a::Foo, b::Bar};`', async () => {
  // For existence the prefix module `crate` alone establishes the edge — both items
  // resolve under it. (Idiomatic grouped imports share a deeper prefix; see next.)
  const { uses } = await run('use crate::{a::Foo, b::Bar};');
  expect(specs(uses)).toEqual(['crate']);
});
