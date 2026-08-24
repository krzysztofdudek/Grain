import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the prefix for a glob whose prefix is a `crate` keyword `use crate::*;`', async () => {
  const { uses } = await run('use crate::*;');
  expect(specs(uses)).toEqual(['crate']);
});
