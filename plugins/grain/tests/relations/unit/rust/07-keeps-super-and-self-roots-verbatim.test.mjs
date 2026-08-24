import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('keeps `super::` and `self::` roots verbatim in the specifier', async () => {
  expect(specs((await run('use super::util::X;')).uses)).toEqual(['super::util::X']);
  expect(specs((await run('use self::y::Z;')).uses)).toEqual(['self::y::Z']);
});
