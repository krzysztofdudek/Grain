import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('EXTENSION METHOD call emits ONLY an extension-method key (order.Validate()), never a type key', async () => {
  const { uses } = await run(
    ['class C { void M(object order) { order.Validate(); } }', ''].join('\n'),
  );
  // The receiver `order` is a parameter (a value), so the call is looked up as an extension method by NAME in the namespaces in scope (m27). Its `()`-suffixed key lives in a string space no type key can reach, and with no in-repo `Validate` extension it resolves to nothing.
  expect(symbolKeys(uses)).toEqual(['Validate()']);
});
