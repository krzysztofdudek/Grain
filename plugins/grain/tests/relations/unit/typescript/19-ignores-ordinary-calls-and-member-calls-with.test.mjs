import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('ignores ordinary calls and member calls that merely take a string argument', async () => {
  // `foo('./x')` (plain identifier callee, not `require`) and `obj.method('./x')`
  // (member-expression callee) are neither dynamic import nor require → no edge.
  const { uses } = await run(`foo('./x');\nobj.method('./y');`);
  expect(uses).toHaveLength(0);
});
