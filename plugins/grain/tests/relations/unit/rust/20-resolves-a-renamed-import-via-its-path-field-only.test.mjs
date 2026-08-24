import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('resolves a renamed import via its `path` field only `use a as b;`', async () => {
  // The alias `b` is a local binding; the emitted specifier is the real path `a`.
  const { uses } = await run('use a as b;');
  expect(specs(uses)).toEqual(['a']);
});
