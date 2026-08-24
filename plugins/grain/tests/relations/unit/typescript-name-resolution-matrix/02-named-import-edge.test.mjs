import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  expect,
  withParsedFiles,
  extractorForLanguage,
  SymbolTable,
  makeResolver,
  resolveCandidateGroup,
  makeResolvePathToFile,
} from '../_unit-harness.mjs';

// Ported from Yggdrasil's typescript-name-resolution-matrix.test.ts case 'typescript-named-import-edge',
// backed by reference/relations/typescript/typescript-named-import-edge.md. This file inlines the
// reference-case-runner's runCase() logic (materialize -> parse -> symbol table ->
// resolver -> extractor.uses() -> resolveCandidateGroup -> edge assertions) since
// runCase itself is not part of the ported unit-harness surface.

/** The node a file belongs to: basename of its parent directory. */
function nodeOf(filePath) {
  const segs = filePath.split('/');
  return segs.length >= 2 ? segs[segs.length - 2] : '';
}

test('typescript-named-import-edge', async () => {
  const files = [
  { path: "r/m/value.ts", language: "typescript", code: "export const X = 1;\nexport const Y = 2;\n" },
  { path: "r/app/use.ts", language: "typescript", code: "import { X, Y } from '../m/value';\nconsole.log(X, Y);\n" },
  ];
  const materializeOnlyFiles = [

  ];
  const expectEdges = [
  { fromFile: "r/app/use.ts", line: 1, node: "m" },
  ];
  const expectSilence = false;

  const root = mkdtempSync(path.join(os.tmpdir(), 'grain-tsmatrix-'));
  try {
    for (const f of [...files, ...materializeOnlyFiles]) {
      const abs = path.join(root, f.path);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, f.code, 'utf-8');
    }

    await withParsedFiles(files, async (parsedFiles) => {
      const parsedByPath = new Map();
      files.forEach((f, i) => parsedByPath.set(f.path, parsedFiles[i]));

      // Universe SymbolTable (unused by TS's path-axis resolution, built for parity with runCase).
      const symbolTable = new SymbolTable();
      for (const f of files) {
        const extractor = extractorForLanguage(f.language);
        if (!extractor) continue;
        const parsed = parsedByPath.get(f.path);
        for (const decl of extractor.declarations(parsed)) {
          symbolTable.declare(f.language, decl.symbolKey, f.path);
        }
      }

      const ownerOf = (file) => nodeOf(file) || undefined;
      const resolver = makeResolver({
        ownerIndex: { ownerOf },
        symbolTable,
        resolvePathToFile: makeResolvePathToFile(root, ownerOf),
      });

      const edges = [];
      for (const f of files) {
        const extractor = extractorForLanguage(f.language);
        if (!extractor) continue;
        const parsed = parsedByPath.get(f.path);
        const fromNode = nodeOf(f.path);
        const detected = extractor.uses(parsed);
        for (const dep of detected) {
          const ownerNode = resolveCandidateGroup(dep.candidates, resolver, f.path, f.language);
          if (ownerNode !== undefined && ownerNode !== fromNode) {
            edges.push({ fromFile: f.path, line: dep.line, node: ownerNode });
          }
        }
      }

      const edgeKey = (e) => `${e.fromFile}:${e.line}->${e.node}`;
      const actual = [...new Set(edges.map(edgeKey))];
      const expected = [...new Set(expectEdges.map(edgeKey))];

      for (const e of expectEdges) {
        expect(actual).toContain(edgeKey(e));
      }
      for (const a of actual) {
        expect(expected).toContain(a);
      }
      if (expectSilence && expectEdges.length === 0) {
        expect(edges).toHaveLength(0);
      }
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
