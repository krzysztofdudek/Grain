import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits the path for a `pub use` re-export (visibility is irrelevant to the edge)', async () => {
  const { uses } = await run('pub use crate::api::Handler;');
  expect(specs(uses)).toEqual(['crate::api::Handler']);
});
