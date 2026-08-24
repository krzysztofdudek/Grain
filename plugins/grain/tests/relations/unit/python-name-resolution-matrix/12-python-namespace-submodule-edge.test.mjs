import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  expect,
  withParsedFiles,
  extractorForLanguage,
  SymbolTable,
  makeResolver,
  resolveCandidateGroup,
  makeResolvePathToFile,
} from '../_unit-harness.mjs';

// Inlined from Yggdrasil's reference-case-runner.ts (the shared body behind every
// `it` in this suite): materializes `## Files` into a temp project, runs the real
// relation pass, and asserts the documented `## Expect` outcome — every expected edge
// present, and no unexpected cross-node edge.
function nodeOf(filePath) {
  const segs = filePath.split('/');
  return segs.length >= 2 ? segs[segs.length - 2] : '';
}

async function runCase(files, expectEdges, expectSilence) {
  const dir = mkdtempSync(join(tmpdir(), 'grain-refcase-'));
  try {
    for (const f of files) {
      const abs = join(dir, f.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, f.code, 'utf8');
    }
    await withParsedFiles(files, async (parsedFiles) => {
      const parsedByPath = new Map();
      files.forEach((f, i) => parsedByPath.set(f.path, parsedFiles[i]));

      const symbolTable = new SymbolTable();
      for (const f of files) {
        const extractor = extractorForLanguage(f.language);
        if (!extractor) continue;
        for (const decl of extractor.declarations(parsedByPath.get(f.path))) {
          symbolTable.declare(f.language, decl.symbolKey, f.path);
        }
      }

      const ownerIndex = { ownerOf: nodeOf };
      const resolver = makeResolver({
        ownerIndex,
        symbolTable,
        resolvePathToFile: makeResolvePathToFile(dir, nodeOf),
      });

      const edges = [];
      for (const f of files) {
        const extractor = extractorForLanguage(f.language);
        if (!extractor) continue;
        const fromNode = nodeOf(f.path);
        for (const dep of extractor.uses(parsedByPath.get(f.path))) {
          const ownerNode = resolveCandidateGroup(dep.candidates, resolver, f.path, f.language);
          if (ownerNode !== undefined && ownerNode !== fromNode) {
            edges.push({ fromFile: f.path, line: dep.line, node: ownerNode });
          }
        }
      }

      const edgeKey = (e) => `${e.fromFile}:${e.line}->${e.node}`;
      const actual = new Set(edges.map(edgeKey));
      const expected = new Set(expectEdges.map(edgeKey));
      // grain adaptation: the harness's toContain only special-cases arrays/strings (not
      // Set, which vitest's real toContain accepts directly) — spread to an array.
      for (const e of expectEdges) expect([...actual]).toContain(edgeKey(e));
      for (const a of actual) expect([...expected]).toContain(a);
      if (expectSilence && expectEdges.length === 0) expect(edges).toHaveLength(0);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const CASE_FILES = [
  { path: "src/plugins/audit.py", language: 'python', code: "def record():\n    pass\n" },
  { path: "src/app/main.py", language: 'python', code: "from plugins import audit\n\naudit.record()\n" },
];
const EXPECT_EDGES = [
  { fromFile: "src/app/main.py", line: 1, node: "plugins" },
];
const EXPECT_SILENCE = false;

test("python-namespace-submodule-edge", async () => {
  await runCase(CASE_FILES, EXPECT_EDGES, EXPECT_SILENCE);
});
