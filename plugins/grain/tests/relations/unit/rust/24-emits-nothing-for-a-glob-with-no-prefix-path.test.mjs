import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits nothing for a glob with no prefix path `use ::*;`', async () => {
  // The wildcard has no prefix node (bare `*`), so there is nothing to emit.
  const { uses } = await run('use ::*;');
  expect(specs(uses)).toEqual([]);
});
