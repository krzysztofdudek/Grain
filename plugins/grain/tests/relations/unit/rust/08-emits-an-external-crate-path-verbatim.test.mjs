import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits an external-crate path verbatim (the resolver, not the extractor, silences it)', async () => {
  const { uses } = await run('use std::collections::HashMap;');
  expect(specs(uses)).toEqual(['std::collections::HashMap']);
});
