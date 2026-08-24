import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('ignores a bare top-level brace list with no prefix `use {a, b};`', async () => {
  // A bare `use {a, b};` parses with the brace list as the argument node directly; it is
  // not a recognised argument shape, so nothing is emitted (unhandled-argument case).
  const { uses } = await run('use {a, b};');
  expect(specs(uses)).toEqual([]);
});
