import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('keeps the `self` item of a group covered by the common prefix `use crate::a::{self, B};`', async () => {
  // The `self` leaf means the prefix module itself, already covered by `crate::a`.
  const { uses } = await run('use crate::a::{self, B};');
  expect(specs(uses)).toEqual(['crate::a']);
});
