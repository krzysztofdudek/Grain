import { test } from 'node:test';
import { expect, withParsedFile, extractorForLanguage, SymbolTable, makeResolver } from '../_unit-harness.mjs';

// Ported from the java-name-resolution-matrix suite's "declaration-key shape & resolver
// invariants (not expressible in runCase)" describe block — a direct extractor/resolver
// assertion, not a runCase catalogue case.

const ROOT = 'src/main/java';

test('SEALED (latent): a nested decl is `+`-chained and package-qualified, never a flat phantom `Inner`', async () => {
  // GENUINE FLAT-KEY PHANTOM this matrix exposed and FIXED — the SAME shape as the
  // pre-fix Kotlin nested-type bug, and worse (Java did not even package-qualify).
  // Now that inline fully-qualified TYPE references emit `symbol` hints, the SymbolTable
  // IS read for Java resolution — so the phantom flat `Inner` key is no longer merely
  // latent: were a nested decl keyed as a flat `Inner` (or an un-package-qualified one),
  // an inline `com.acme.Inner`-shaped reference could mis-bind. It is sealed by `+`-keying
  // the nested chain and package-qualifying the key: the `+` namespace is disjoint from
  // the dotted FQN namespace a `scoped_type_identifier` hint carries, so a nested type is
  // reachable only via its enclosing-file fallback, never as a flat phantom.
  const javaExtractor = extractorForLanguage('java');
  await withParsedFile(`${ROOT}/com/acme/Outer.java`, 'package com.acme;\nclass Outer {\n  class Inner {}\n}\n', 'java', (nestedFile) => {
    expect(javaExtractor.declarations(nestedFile).map((d) => d.symbolKey)).toEqual([
      'com.acme.Outer',
      'com.acme.Outer+Inner', // NOT the phantom flat `Inner` / `com.acme.Inner`
    ]);
    // Defense-in-depth: a top-level `import com.acme.Inner` (symbol key `com.acme.Inner`)
    // finds nothing in the table → SILENCE (the `+` key is disjoint from the dot namespace).
    const st = new SymbolTable();
    for (const d of javaExtractor.declarations(nestedFile)) st.declare('java', d.symbolKey, nestedFile.path);
    expect(st.has('java', 'com.acme.Inner')).toBe(false);
    expect(st.has('java', 'com.acme.Outer+Inner')).toBe(true);
    const r = makeResolver({
      ownerIndex: { ownerOf: (f) => ({ [nestedFile.path]: 'a' })[f] },
      symbolTable: st,
      resolvePathToFile: () => undefined,
    });
    expect(r.classify({ kind: 'symbol', symbolKey: 'com.acme.Inner' }, `${ROOT}/com/x/Use.java`, 'java')).toEqual({ kind: 'absent' });
  });
});
