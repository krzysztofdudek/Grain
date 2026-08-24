import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);

test('ignores top-level items that are not struct/enum/trait/fn/mod (impl, const, static, use)', async () => {
  // Only the five named item kinds become declarations; an `impl` (no name), a `const`,
  // a `static`, and a `use` are all skipped by the item-type filter.
  const { declarations } = await run('use crate::a;\nstruct S {}\nimpl S {}\nconst X: u32 = 1;\nstatic Y: u32 = 2;\n');
  const keys = declarations.map(d => d.symbolKey);
  expect(keys).toEqual(['S']);
});
