import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('rewrites a `using`-alias-qualified `S::Tail` reference to the aliased FQN', async () => {
  const { uses } = await run(
    'using S = App.Space;\nnamespace App;\nclass C {\n  S::Widget W;\n}\n',
  );
  const keys = symbolKeys(uses);
  // `S::Widget` with `using S = App.Space;` rewrites to `App.Space.Widget`, resolved from root.
  expect(keys).toContain('App.Space.Widget');
});
