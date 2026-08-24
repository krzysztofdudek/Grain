import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cppExtractor = extractorForLanguage('cpp');
const run = (code, ext = '.cpp') => runExtractor(cppExtractor, 'cpp', ext, code);

test('returns function, class, struct, namespace, and typedef names', async () => {
  const { declarations } = await run(
    'namespace orders { class Order : public Base { int x; }; }\nstruct S {};\ntypedef int my_int;\nvoid run() {}\n',
  );
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('orders');
  expect(keys).toContain('Order');
  expect(keys).toContain('S');
  expect(keys).toContain('my_int');
  expect(keys).toContain('run');
});
