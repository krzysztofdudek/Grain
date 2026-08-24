import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits nothing for a glob whose prefix is an unrenderable scoped path `use ::foo::*;`', async () => {
  // The wildcard prefix `::foo` is a scoped_identifier that renders to undefined, so no
  // specifier is emitted (silence over a guess).
  const { uses } = await run('use ::foo::*;');
  expect(specs(uses)).toEqual([]);
});
