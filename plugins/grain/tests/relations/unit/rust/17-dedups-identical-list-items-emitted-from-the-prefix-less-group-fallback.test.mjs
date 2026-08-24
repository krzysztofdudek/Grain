import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('dedups identical list items emitted from the prefix-less group fallback `use ::{a, a};`', async () => {
  // Both items render to `a` on the same line; the second is deduped (specifier+line key).
  const { uses } = await run('use ::{a, a};');
  expect(specs(uses)).toEqual(['a']);
  expect(uses).toHaveLength(1);
});
