import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

const symbolKeys = (uses) =>
  uses.flatMap((u) => u.candidates.flatMap((c) => (c.kind === 'symbol' ? [c.symbolKey] : [])));

test('inside a namespace, emits BOTH the enclosing-namespace expansion AND the verbatim form for a multi-segment qualified base type', async () => {
  // `Foo.Bar.Base` written inside `namespace App;` could bind to `App.Foo.Bar.Base`
  // (enclosing-namespace lookup) OR top-level `Foo.Bar.Base`. We emit BOTH candidates;
  // resolveUnique keeps only one if exactly one resolves, and silences if both resolve
  // to different files.
  const { uses } = await run(['namespace App;', 'class C : Foo.Bar.Base { }', ''].join('\n'));
  const keys = symbolKeys(uses);
  expect(keys).toContain('App.Foo.Bar.Base'); // enclosing-namespace expansion
  expect(keys).toContain('Foo.Bar.Base'); // verbatim fallback
});
