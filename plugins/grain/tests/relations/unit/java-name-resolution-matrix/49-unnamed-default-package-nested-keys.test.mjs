import { test } from 'node:test';
import { expect, withParsedFile, extractorForLanguage } from '../_unit-harness.mjs';

// Ported from the java-name-resolution-matrix suite's "declaration-key shape & resolver
// invariants (not expressible in runCase)" describe block — a direct extractor assertion,
// not a runCase catalogue case.

const ROOT = 'src/main/java';

test('unnamed/default-package nested decls key bare `Outer` / `Outer+Inner`, never a leading dot', async () => {
  const javaExtractor = extractorForLanguage('java');
  await withParsedFile(`${ROOT}/Top.java`, 'class Outer {\n  class Inner {}\n}\n', 'java', (noPkg) => {
    const keys = javaExtractor.declarations(noPkg).map((d) => d.symbolKey);
    expect(keys).toEqual(['Outer', 'Outer+Inner']);
    expect(keys.every((k) => !k.startsWith('.'))).toBe(true);
  });
});
