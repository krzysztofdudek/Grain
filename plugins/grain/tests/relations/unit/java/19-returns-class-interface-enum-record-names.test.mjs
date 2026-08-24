import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('java'), 'java', '.java', code);

test('returns class / interface / enum / record names', async () => {
  const { declarations } = await run(
    [
      'class Foo {}',
      'interface Bar {}',
      'enum Baz { A, B }',
      'record Qux(int a) {}',
      '',
    ].join('\n'),
  );
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('Foo');
  expect(keys).toContain('Bar');
  expect(keys).toContain('Baz');
  expect(keys).toContain('Qux');
});
