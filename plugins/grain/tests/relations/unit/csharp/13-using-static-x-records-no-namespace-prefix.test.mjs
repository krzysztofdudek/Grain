import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test("`using static X;` records NO namespace prefix — it imports a TYPE's members, not a namespace", async () => {
  const { uses } = await run(
    ['using static Foo.Bar.Calc;', 'class C : Baz { }', ''].join('\n'),
  );
  const keys = symbolKeys(uses);
  // No plain namespace prefix recorded → the bare base `Baz` yields NO `Foo.Bar.Baz` candidate.
  // (The static-using TARGET `Foo.Bar.Calc` IS emitted as its own fully-qualified dependency,
  // but it never expands into a sibling-namespace candidate for `Baz`.)
  expect(keys).not.toContain('Foo.Bar.Baz');
  expect(keys.some((k) => k.endsWith('.Baz'))).toBe(false);
});
