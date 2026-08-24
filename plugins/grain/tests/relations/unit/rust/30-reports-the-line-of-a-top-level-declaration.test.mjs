import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = code => runExtractor(extractorForLanguage('rust'), 'rust', '.rs', code);

test('reports the line of a top-level declaration', async () => {
  const { declarations } = await run('\nstruct Order {}\n');
  expect(declarations[0]?.symbolKey).toBe('Order');
  expect(declarations[0]?.line).toBe(2);
});
