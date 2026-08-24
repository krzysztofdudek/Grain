import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, withParsedFiles, extractorForLanguage, SymbolTable, makeResolver, resolveCandidateGroup, makeResolvePathToFile } from '../_unit-harness.mjs';

// Ported from Yggdrasil's reference-case-runner.ts `runCase('java-switch-pattern-types-edge')`, which drives the
// catalogue doc reference/relations/java/java-switch-pattern-types-edge.md end-to-end through the real extractor +
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
    "path": "src/main/java/com/a/Circle.java",
    "code": "package com.a;\npublic class Circle {}\n"
  },
  {
    "path": "src/main/java/com/a/Rect.java",
    "code": "package com.a;\npublic record Rect(com.b.Point p, com.b.Size s) {}\n"
  },
  {
    "path": "src/main/java/com/b/Point.java",
    "code": "package com.b;\npublic record Point(int x, int y) {}\n"
  },
  {
    "path": "src/main/java/com/b/Size.java",
    "code": "package com.b;\npublic record Size(int w, int h) {}\n"
  },
  {
    "path": "src/main/java/com/app/C.java",
    "code": "package com.app;\nclass C {\n  Object m(Object shape) {\n    return switch (shape) {\n      case com.a.Circle c -> 1;\n      case com.a.Rect(com.b.Point p, com.b.Size s) -> 2;\n      default -> 0;\n    };\n  }\n}\n"
  }
];

const EXPECT_EDGES = [
  "src/main/java/com/a/Rect.java:2->b",
  "src/main/java/com/app/C.java:5->a",
  "src/main/java/com/app/C.java:6->b"
];

test('java-switch-pattern-types-edge', async () => {
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
