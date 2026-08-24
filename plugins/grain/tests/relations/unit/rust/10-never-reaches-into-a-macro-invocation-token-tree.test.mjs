import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);
const specs = uses => uses.flatMap(u => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('never reaches into a macro invocation token tree (macro deps are invisible)', async () => {
  // A `crate::…` path appearing only inside a macro call is unparsed tokens, never a
  // use_declaration → zero hints.
  const { uses } = await run('fn f() {\n  println!("{}", crate::config::NAME);\n}\n');
  expect(specs(uses)).toEqual([]);
});
