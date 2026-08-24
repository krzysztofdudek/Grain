import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the prefix module for a glob `use crate::events::*;`', async () => {
  const { uses } = await run('use crate::events::*;');
  expect(specs(uses)).toEqual(['crate::events']);
});
