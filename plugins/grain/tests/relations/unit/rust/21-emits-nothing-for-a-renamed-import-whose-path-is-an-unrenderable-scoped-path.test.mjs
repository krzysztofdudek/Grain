import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits nothing for a renamed import whose path is an unrenderable scoped path `use ::foo as bar;`', async () => {
  const { uses } = await run('use ::foo as bar;');
  expect(specs(uses)).toEqual([]);
});
