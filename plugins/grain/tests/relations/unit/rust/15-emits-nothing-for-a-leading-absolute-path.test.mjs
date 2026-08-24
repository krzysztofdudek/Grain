import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits nothing for a leading-`::` absolute path `use ::foo::Bar;` (malformed prefix → silence)', async () => {
  // The leading `::` produces a scoped_identifier whose leftmost leaf has no `path`
  // field, so the path renderer cannot determine the first segment and returns nothing.
  const { uses } = await run('use ::foo::Bar;');
  expect(specs(uses)).toEqual([]);
});
