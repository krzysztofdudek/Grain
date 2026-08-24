import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);

test('returns top-level struct / enum / trait / fn / mod names', async () => {
  const { declarations } = await run('pub struct Order { id: u32 }\nenum E { A }\ntrait T {}\nfn f() {}\nmod m;\n');
  const keys = declarations.map(d => d.symbolKey);
  expect(keys).toEqual(expect.arrayContaining(['Order', 'E', 'T', 'f', 'm']));
});
