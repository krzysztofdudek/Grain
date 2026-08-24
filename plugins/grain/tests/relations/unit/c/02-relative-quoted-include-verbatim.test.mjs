import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cExtractor = extractorForLanguage('c');
const run = (code, ext = '.c') => runExtractor(cExtractor, 'c', ext, code);
const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('emits a path hint for a relative quoted include verbatim', async () => {
  const { uses } = await run('#include "../inc/foo.h"\n');
  expect(specs(uses)).toEqual(['../inc/foo.h']);
});
