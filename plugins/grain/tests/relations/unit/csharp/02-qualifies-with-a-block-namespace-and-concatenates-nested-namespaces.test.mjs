import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

test('qualifies with a BLOCK namespace and concatenates NESTED namespaces', async () => {
  const { declarations } = await run(
    ['namespace Outer {', '  namespace Inner {', '    class C { }', '  }', '}', ''].join('\n'),
  );
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('Outer.Inner.C');
});
