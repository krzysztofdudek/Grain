import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

test('keys a file-scope nested type `Outer+Inner` with no namespace prefix', async () => {
  const { declarations } = await run(['class Outer { class Inner { } }', ''].join('\n'));
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('Outer');
  expect(keys).toContain('Outer+Inner');
  expect(keys).not.toContain('Inner');
});
