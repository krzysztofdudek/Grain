import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('emits the bare type named in an `o is Zed` constant pattern', async () => {
  const { uses } = await run(
    'namespace App;\nclass C {\n  bool M(object o) => o is Widget;\n}\n',
  );
  const keys = symbolKeys(uses);
  expect(keys).toContain('Widget');
});
