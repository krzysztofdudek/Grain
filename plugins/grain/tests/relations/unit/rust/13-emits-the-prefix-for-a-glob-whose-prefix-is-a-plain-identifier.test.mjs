import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the prefix for a glob whose prefix is a PLAIN identifier `use foo::*;`', async () => {
  // The wildcard prefix `foo` is a bare `identifier` (not a `scoped_identifier`), so the
  // specifier is the node text `foo` — exercising the ELSE branch of the prefix render.
  const { uses } = await run('use foo::*;');
  expect(specs(uses)).toEqual(['foo']);
});
