import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);

test('does not descend into an inline `mod { … }` for nested items', async () => {
  const { declarations } = await run('mod inline { fn g() {} struct Inner {} }\n');
  const keys = declarations.map(d => d.symbolKey);
  expect(keys).toContain('inline');
  expect(keys).not.toContain('g');
  expect(keys).not.toContain('Inner');
});
