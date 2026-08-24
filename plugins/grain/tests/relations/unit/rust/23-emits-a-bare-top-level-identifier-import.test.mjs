import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits a bare top-level identifier import `use foo;`', async () => {
  // A non-grouped, non-scoped argument at the top level: empty prefix → the tail itself.
  const { uses } = await run('use foo;');
  expect(specs(uses)).toEqual(['foo']);
});
