import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cExtractor = extractorForLanguage('c');
const run = (code, ext = '.c') => runExtractor(cExtractor, 'c', ext, code);

test('returns top-level function, struct, and typedef names', async () => {
  const { declarations } = await run(
    'int do_thing(void) { return 1; }\nchar *make(void) { return 0; }\nstruct Point { int x; };\ntypedef int my_int;\n',
  );
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('do_thing');
  expect(keys).toContain('make'); // pointer-return function: name behind pointer_declarator
  expect(keys).toContain('Point');
  expect(keys).toContain('my_int');
});
