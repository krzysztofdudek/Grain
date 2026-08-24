// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin.test.ts
// describe('kotlin SYMBOL-TABLE resolution — the half this language validates')
import { test } from 'node:test';
import { expect, withParsedFiles, extractorForLanguage, SymbolTable, makeResolver } from '../_unit-harness.mjs';

const kotlinExtractor = extractorForLanguage('kotlin');
/** A Kotlin (path, code) pair as a withParsedFiles spec. */
const kt = (path, code) => ({ path, code, language: 'kotlin' });

test("builds a SymbolTable from two files' declarations() and resolves a third file's import hint to the right file", async () => {
  // grain adaptation: Yggdrasil's ensureLoaderRegistered() has no equivalent — the
  // harness's withParsedFiles/getParser already handles grammar loading.
  // Two declaring files in different packages, plus a consumer that imports one of them.
  await withParsedFiles(
    [
      kt('src/a/PaymentService.kt', 'package com.acme.payments\nclass PaymentService\n'),
      kt('src/b/AuditLog.kt', 'package com.acme.audit\nobject AuditLog\n'),
      kt('src/c/Order.kt', 'package com.acme.orders\nimport com.acme.payments.PaymentService\nclass Order\n'),
    ],
    ([fileA, fileB, consumer]) => {
      // Build the shared SymbolTable exactly as pass.ts step 4 does.
      const st = new SymbolTable();
      for (const f of [fileA, fileB]) {
        for (const d of kotlinExtractor.declarations(f)) st.declare('kotlin', d.symbolKey, f.path);
      }

      // The consumer's import hint must resolve to fileA via resolveUnique.
      const uses = kotlinExtractor.uses(consumer);
      const importHint = uses.find((u) => u.candidates[0].kind === 'symbol');
      expect(importHint?.candidates[0]).toEqual({ kind: 'symbol', symbolKey: 'com.acme.payments.PaymentService' });
      expect(st.resolveUnique('kotlin', 'com.acme.payments.PaymentService')).toBe('src/a/PaymentService.kt');

      // And the full resolver wires symbol → owner node (mirrors resolver.ts).
      const ownerIndex = { ownerOf: (f) => (f === 'src/a/PaymentService.kt' ? 'a' : f === 'src/b/AuditLog.kt' ? 'b' : undefined) };
      const resolver = makeResolver({ ownerIndex, symbolTable: st, resolvePathToFile: () => undefined });
      expect(resolver.resolve(importHint.candidates[0], consumer.path, 'kotlin')).toEqual({
        ownerNode: 'a',
        resolvedFile: 'src/a/PaymentService.kt',
      });
    },
  );
});
