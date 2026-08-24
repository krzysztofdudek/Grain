import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const groupContaining = (uses, key) => {
  const dep = uses.find((u) => u.candidates.some((c) => c.kind === 'symbol' && c.symbolKey === key));
  return dep?.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : []));
};

test('resolves a BARE name through an ALIAS (`using Gw = Foo.Bar.IGateway;`) — alias expansion is the NEAREST candidate', async () => {
  const { uses } = await run(
    ['using Gw = Foo.Bar.IGateway;', 'class C { void M() { var x = new Gw(); } }', ''].join('\n'),
  );
  // The aliased FQN is the dependency and sits FIRST in the ordered group (the alias is a
  // hard local override, nearest binding). The bare alias name `Gw` is only the harmless
  // verbatim last candidate — it resolves to nothing, so the alias FQN is what binds.
  const group = groupContaining(uses, 'Foo.Bar.IGateway');
  expect(group?.[0]).toBe('Foo.Bar.IGateway');
  expect(group?.[group.length - 1]).toBe('Gw');
});
