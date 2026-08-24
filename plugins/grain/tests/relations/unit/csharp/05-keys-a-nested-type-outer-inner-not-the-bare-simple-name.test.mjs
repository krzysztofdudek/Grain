import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

test('keys a nested type `Outer+Inner` (and deeper `Outer+Obj+Deep`), NOT the bare simple name', async () => {
  const { declarations } = await run(
    [
      'namespace App;',
      'class Outer {',
      '  class Inner { }',
      '  class Obj { class Deep { } }',
      '}',
      '',
    ].join('\n'),
  );
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('App.Outer'); // top-level type unchanged
  expect(keys).toContain('App.Outer+Inner'); // nested → `+` reflection FQN
  expect(keys).toContain('App.Outer+Obj'); // nested
  expect(keys).toContain('App.Outer+Obj+Deep'); // doubly nested
  // D-N5: a nested type emits ONLY its `+` key, never also the bare simple name — that
  // removes the collision that would let a nested `Inner` silence a top-level `App.Inner`.
  expect(keys).not.toContain('App.Inner');
  expect(keys).not.toContain('App.Deep');
  expect(keys).not.toContain('App.Obj');
});
