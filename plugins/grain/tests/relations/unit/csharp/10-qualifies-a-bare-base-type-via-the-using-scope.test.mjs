import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('qualifies a BARE base type via the using scope (`using Foo.Bar; ... : Baz`)', async () => {
  const { uses } = await run(['using Foo.Bar;', 'class C : Baz { }', ''].join('\n'));
  // Candidate FQN = <using prefix>.<bare name>.
  expect(symbolKeys(uses)).toContain('Foo.Bar.Baz');
});
