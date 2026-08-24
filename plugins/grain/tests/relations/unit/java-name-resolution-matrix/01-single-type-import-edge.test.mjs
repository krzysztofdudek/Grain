import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, withParsedFiles, extractorForLanguage, SymbolTable, makeResolver, resolveCandidateGroup, makeResolvePathToFile } from '../_unit-harness.mjs';

// Ported from Yggdrasil's reference-case-runner.ts `runCase('java-single-type-import-edge')`, which drives the
// catalogue doc reference/relations/java/java-single-type-import-edge.md end-to-end through the real extractor +
// resolver. Grain's harness has no catalogue and no runCase, so the doc's embedded ## Files and
// ## Expect are inlined verbatim here and the runner logic (materialize -> parse -> universe
// SymbolTable -> owner index -> real resolver -> extractor.uses() -> resolveCandidateGroup ->
// cross-node edges) is reproduced directly so this file is fully self-contained.

/** node id = basename of a file's parent dir (mirrors reference-case-runner's nodeOf). */
function nodeOf(filePath) {
  const segs = filePath.split('/');
  return segs.length >= 2 ? segs[segs.length - 2] : '';
}

const FILES = [
  {
    "path": "src/main/java/com/acme/payments/PaymentService.java",
    "code": "package com.acme.payments;\npublic class PaymentService {}\n"
  },
  {
    "path": "src/main/java/com/app/Use.java",
    "code": "package com.app;\nimport com.acme.payments.PaymentService;\nclass C {}\n"
  }
];

const EXPECT_EDGES = [
  "src/main/java/com/app/Use.java:2->payments"
];

test('java-single-type-import-edge', async () => {
  await withParsedFiles(
    FILES.map((f) => ({ path: f.path, code: f.code, language: 'java' })),
    async (parsedFiles) => {
      const parsedByPath = new Map();
      FILES.forEach((f, i) => parsedByPath.set(f.path, parsedFiles[i]));

      const extractor = extractorForLanguage('java');
      const symbolTable = new SymbolTable();
      for (const f of FILES) {
        for (const decl of extractor.declarations(parsedByPath.get(f.path))) {
          symbolTable.declare('java', decl.symbolKey, f.path);
        }
      }

      const owners = new Map(FILES.map((f) => [f.path, nodeOf(f.path)]));
      const ownerIndex = { ownerOf: (p) => owners.get(p) };

      const root = mkdtempSync(path.join(os.tmpdir(), 'grain-java-matrix-'));
      try {
        for (const f of FILES) {
          const abs = path.join(root, f.path);
          mkdirSync(path.dirname(abs), { recursive: true });
          writeFileSync(abs, f.code, 'utf-8');
        }

        const resolver = makeResolver({
          ownerIndex,
          symbolTable,
          resolvePathToFile: makeResolvePathToFile(root, ownerIndex.ownerOf),
        });

        const edges = [];
        for (const f of FILES) {
          const fromNode = nodeOf(f.path);
          for (const dep of extractor.uses(parsedByPath.get(f.path))) {
            const ownerNode = resolveCandidateGroup(dep.candidates, resolver, f.path, 'java');
            if (ownerNode !== undefined && ownerNode !== fromNode) {
              edges.push(`${f.path}:${dep.line}->${ownerNode}`);
            }
          }
        }

        const actual = new Set(edges);
        for (const e of EXPECT_EDGES) {
          // expected edge ${e} must be emitted
          expect(actual.has(e)).toBe(true);
        }
        for (const a of actual) {
          // no unexpected cross-node edge beyond EXPECT_EDGES
          expect(EXPECT_EDGES.includes(a)).toBe(true);
        }
        if (EXPECT_EDGES.length === 0) {
          expect(edges).toHaveLength(0);
        }
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    },
  );
});
