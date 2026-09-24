import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits every item of a crate-rooted group `use crate::{a::Foo, b::Bar};` on its own', async () => {
  // The group prefix `crate` names no module; each item path is its own dependency (rustfmt imports_granularity = "Crate" / rust-analyzer merge-imports produce this).
  const { uses } = await run('use crate::{a::Foo, b::Bar};');
  expect(specs(uses)).toEqual(['crate::a::Foo', 'crate::b::Bar']);
});
