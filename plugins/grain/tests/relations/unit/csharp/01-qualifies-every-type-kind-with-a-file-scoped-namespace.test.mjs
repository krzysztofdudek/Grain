import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('csharp'), 'csharp', '.cs', code);

test('qualifies every type kind with a FILE-SCOPED namespace (namespace Foo.Bar;)', async () => {
  const { declarations } = await run(
    [
      'namespace Foo.Bar;',
      'public class C { }',
      'public interface IThing { }',
      'public struct S { }',
      'public record Money(decimal A);',
      'public enum E { X }',
      '',
    ].join('\n'),
  );
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('Foo.Bar.C');
  expect(keys).toContain('Foo.Bar.IThing');
  expect(keys).toContain('Foo.Bar.S');
  expect(keys).toContain('Foo.Bar.Money');
  expect(keys).toContain('Foo.Bar.E');
});
