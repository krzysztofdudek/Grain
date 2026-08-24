import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const groupContaining = (uses, key) => {
  const dep = uses.find((u) => u.candidates.some((c) => c.kind === 'symbol' && c.symbolKey === key));
  return dep?.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : []));
};

test('resolves a bare name through a `global using Alias = Foo.Bar.IGateway;` alias — alias expansion is NEAREST', async () => {
  const { uses } = await run(
    ['global using Gw = Foo.Bar.IGateway;', 'class C { void M() { var x = new Gw(); } }', ''].join('\n'),
  );
  const group = groupContaining(uses, 'Foo.Bar.IGateway');
  expect(group?.[0]).toBe('Foo.Bar.IGateway'); // alias expansion is the first/nearest candidate
  expect(group?.[group.length - 1]).toBe('Gw'); // bare alias name only as harmless last
});
