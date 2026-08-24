import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('go'), 'go', '.go', code);

const specs = (uses) => uses.flatMap((u) => (u.candidates[0].kind === 'path' ? [u.candidates[0].specifier] : []));

test('handles a grouped block mixing plain / alias / blank / dot imports', async () => {
  const { uses } = await run(
    'package main\nimport (\n  "fmt"\n  pay "example.com/m/billing"\n  _ "example.com/m/driver"\n  . "example.com/m/dsl"\n)\n',
  );
  const s = specs(uses);
  expect(s).toEqual(
    expect.arrayContaining([
      'fmt',
      'example.com/m/billing',
      'example.com/m/driver',
      'example.com/m/dsl',
    ]),
  );
  expect(s).toHaveLength(4);
});
