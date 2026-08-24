import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, withParsedFiles, extractorForLanguage, SymbolTable, makeResolver, resolveCandidateGroup, makeResolvePathToFile } from '../_unit-harness.mjs';

// Ported from Yggdrasil's reference-case-runner.ts `runCase('java-module-info-uses-provides')`, which drives the
// catalogue doc reference/relations/java/java-module-info-uses-provides.md end-to-end through the real extractor +
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
    "path": "src/main/java/com/acme/spi/Intf.java",
    "code": "package com.acme.spi;\npublic interface Intf {}\n"
  },
  {
    "path": "src/main/java/com/acme/impl/Impl.java",
    "code": "package com.acme.impl;\npublic class Impl implements com.acme.spi.Intf {}\n"
  },
  {
    "path": "src/main/java/com/acme/req/ReqType.java",
    "code": "package com.acme.req;\npublic class ReqType {}\n"
  },
  {
    "path": "src/main/java/com/acme/exp/ExpType.java",
    "code": "package com.acme.exp;\npublic class ExpType {}\n"
  },
  {
    "path": "src/main/java/com/acme/opn/OpnType.java",
    "code": "package com.acme.opn;\npublic class OpnType {}\n"
  },
  {
    "path": "src/main/java/module-info.java",
    "code": "module com.example.foo {\n  requires com.acme.req.ReqType;\n  exports com.acme.exp.ExpType;\n  opens com.acme.opn.OpnType;\n  uses com.acme.spi.Intf;\n  provides com.acme.spi.Intf with com.acme.impl.Impl;\n}\n"
  }
];

const EXPECT_EDGES = [
  "src/main/java/module-info.java:5->spi",
  "src/main/java/module-info.java:6->spi",
  "src/main/java/module-info.java:6->impl",
  "src/main/java/com/acme/impl/Impl.java:2->spi"
];

test('java-module-info-uses-provides', async () => {
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
