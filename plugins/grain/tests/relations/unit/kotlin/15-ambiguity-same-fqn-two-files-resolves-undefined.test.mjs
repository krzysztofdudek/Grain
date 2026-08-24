// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin SYMBOL-TABLE resolution — the half this language validates')
import { test } from 'node:test';
import { expect, withParsedFiles, extractorForLanguage, SymbolTable, makeResolver } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');
/** A Kotlin (path, code) pair as a withParsedFiles spec. */
const kt = (path, code) => ({ path, code, language: 'kotlin' });

test('AMBIGUITY: two files declaring the SAME FQN → a use of it resolves to undefined (silence, no flag)', async () => {
  // grain adaptation: Yggdrasil's ensureLoaderRegistered() has no equivalent — the
  // harness's withParsedFiles/getParser already handles grammar loading.
  // Two files both declare com.acme.dup.Thing — the FQN is ambiguous.
  await withParsedFiles(
    [
      kt('src/x/Thing.kt', 'package com.acme.dup\nclass Thing\n'),
      kt('src/y/Thing.kt', 'package com.acme.dup\nclass Thing\n'),
      kt('src/z/Use.kt', 'package com.acme.z\nimport com.acme.dup.Thing\nclass Use\n'),
    ],
    ([fileX, fileY, consumer]) => {
      const st = new SymbolTable();
      for (const f of [fileX, fileY]) {
        for (const d of kotlinExtractor.declarations(f)) st.declare('kotlin', d.symbolKey, f.path);
      }

      // resolveUnique returns undefined for the ambiguous FQN.
      expect(st.resolveUnique('kotlin', 'com.acme.dup.Thing')).toBeUndefined();

      // Through the resolver the use also resolves to undefined — silence, never a flag.
      const ownerIndex = { ownerOf: () => 'someNode' };
      const resolver = makeResolver({ ownerIndex, symbolTable: st, resolvePathToFile: () => undefined });
      const importHint = kotlinExtractor.uses(consumer).find((u) => u.candidates[0].kind === 'symbol');
      expect(resolver.resolve(importHint.candidates[0], consumer.path, 'kotlin')).toBeUndefined();
    },
  );
});
