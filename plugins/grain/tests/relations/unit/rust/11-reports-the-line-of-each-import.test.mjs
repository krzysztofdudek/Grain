import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);

test('reports the line of each import', async () => {
  const { uses } = await run('\n\nuse crate::a::A;\n');
  expect(uses[0]?.line).toBe(3);
});
