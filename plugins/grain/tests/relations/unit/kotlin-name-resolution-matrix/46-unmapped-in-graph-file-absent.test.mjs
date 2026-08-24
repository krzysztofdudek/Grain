// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin-name-resolution-matrix.test.ts
// it('UNMAPPED in-graph file → absent (coverage matter, never a violation; not expressible in runCase)', ...)
//
// Resolver-level case runCase cannot express: the runCase harness maps EVERY embedded file to
// its parent-directory node, so a declared-but-UNMAPPED in-graph file (ownerOf → undefined →
// `absent`) is unreachable there. Kept as a direct extractor+resolver assertion (no catalogue
// .md) so the Kotlin-specific path is still pinned and nothing is dropped.
import { test } from 'node:test';
import { expect, withParsedFile, extractorForLanguage, SymbolTable, makeResolver } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');

test('UNMAPPED in-graph file → absent (coverage matter, never a violation; not expressible in runCase)', async () => {
  // grain adaptation: Yggdrasil's ensureLoaderRegistered() has no equivalent — the
  // harness's withParsedFile/getParser already handles grammar loading.
  const code = 'package com.acme\nclass Order\n';
  // The declarations are plain data — the WASM tree lives only inside this call.
  const decls = await withParsedFile('src/a/Order.kt', code, 'kotlin', (file) => kotlinExtractor.declarations(file));
  const st = new SymbolTable();
  for (const d of decls) st.declare('kotlin', d.symbolKey, 'src/a/Order.kt');
  // ownerOf returns undefined → the mapped file has no owning node → absent (silence).
  const r = makeResolver({
    ownerIndex: { ownerOf: () => undefined },
    symbolTable: st,
    resolvePathToFile: () => undefined,
  });
  expect(r.classify({ kind: 'symbol', symbolKey: 'com.acme.Order' }, 'src/c/Use.kt', 'kotlin')).toEqual({ kind: 'absent' });
});
