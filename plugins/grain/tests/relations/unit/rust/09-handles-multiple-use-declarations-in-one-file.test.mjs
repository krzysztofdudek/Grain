import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('handles multiple use declarations in one file', async () => {
  const { uses } = await run('use crate::a::A;\nuse crate::b::*;\nuse super::c::C as Cc;\n');
  const s = specs(uses);
  expect(s).toEqual(expect.arrayContaining(['crate::a::A', 'crate::b', 'super::c::C']));
  expect(s).toHaveLength(3);
});
