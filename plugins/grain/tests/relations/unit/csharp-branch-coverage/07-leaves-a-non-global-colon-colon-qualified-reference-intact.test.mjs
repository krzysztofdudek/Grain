import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('leaves a non-global `::`-qualified reference intact (silence-by-luck at resolution)', async () => {
  const { uses } = await run('namespace App;\nclass C {\n  Lib::Space.Widget W;\n}\n');
  const keys = symbolKeys(uses);
  // With no `using Lib = ...;` the `::` text is kept verbatim: it can never match a dot-only
  // declaration key, so it resolves to nothing (R13) rather than being rewritten to a real FQN.
  expect(keys).toContain('Lib::Space.Widget');
  // It is NOT rewritten into a resolvable dot-only key such as `Space.Widget`.
  expect(keys).not.toContain('Space.Widget');
});
