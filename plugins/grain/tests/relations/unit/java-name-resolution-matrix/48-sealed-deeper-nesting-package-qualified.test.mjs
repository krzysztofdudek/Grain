import { test } from 'node:test';
import { expect, withParsedFile, extractorForLanguage } from '../_unit-harness.mjs';

// Ported from the java-name-resolution-matrix suite's "declaration-key shape & resolver
// invariants (not expressible in runCase)" describe block — a direct extractor assertion,
// not a runCase catalogue case.

const ROOT = 'src/main/java';

test('SEALED (latent): deeper nesting is `+`-chained and package-qualified, never flat', async () => {
  const javaExtractor = extractorForLanguage('java');
  await withParsedFile(
    `${ROOT}/com/acme/Outer.java`,
    'package com.acme;\nclass Outer {\n  static class Mid {\n    interface Deep {}\n  }\n}\n',
    'java',
    (deepFile) => {
      expect(deepFile && javaExtractor.declarations(deepFile).map((d) => d.symbolKey)).toEqual([
        'com.acme.Outer',
        'com.acme.Outer+Mid',
        'com.acme.Outer+Mid+Deep',
      ]);
    },
  );
});
