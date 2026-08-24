import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('inside a namespace with a using, expands a qualified BASE type the same way', async () => {
  const { uses } = await run(
    ['using Domain;', 'namespace App.Sub;', 'class C : Models.Base { }', ''].join('\n'),
  );
  const keys = symbolKeys(uses);
  expect(keys).toContain('App.Sub.Models.Base'); // enclosing block namespace expansion
  expect(keys).toContain('Domain.Models.Base'); // using-prefix expansion
  expect(keys).toContain('Models.Base'); // verbatim fallback
});
