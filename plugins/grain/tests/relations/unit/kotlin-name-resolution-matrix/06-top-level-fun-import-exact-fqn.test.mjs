// Ported 1:1 from Yggdrasil source/cli/tests/unit/relations/extractors/kotlin-name-resolution-matrix.test.ts
// it('kotlin-top-level-fun-import-exact-fqn', () => runCase('kotlin-top-level-fun-import-exact-fqn'))
//
// grain adaptation: Grain vendors no reference/relations/**/*.md catalogue and no
// reference-case-runner.ts, so this file inlines the catalogue case's `## Files` fixtures
// and `## Expect` edges (from Yggdrasil reference/relations/kotlin/kotlin-top-level-fun-import-exact-fqn.md) and
// re-implements runCase's pipeline trimmed to what a kotlin-only case needs: real
// extractor.declarations() build a universe SymbolTable, a real makeResolver (symbol-axis
// resolution; resolvePathToFile is wired but kotlin never emits a path hint), then real
// extractor.uses() + resolveCandidateGroup per file — the identical ordered-candidate walk
// pass.ts runs — asserting every expected edge is present and no unexpected cross-node edge
// appears (so a case cannot pass while emitting a spurious edge).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import {
  withParsedFiles,
  extractorForLanguage,
  SymbolTable,
  makeResolver,
  resolveCandidateGroup,
  makeResolvePathToFile,
} from '../_unit-harness.mjs';

const FILES = [
  {
    "path": "src/u/Util.kt",
    "language": "kotlin",
    "code": "package com.acme.util\nfun retry() {}\n"
  },
  {
    "path": "src/c/Use.kt",
    "language": "kotlin",
    "code": "package com.acme.app\nimport com.acme.util.retry\nclass C\n"
  }
];
const EXPECT_EDGES = [
  {
    "fromFile": "src/c/Use.kt",
    "line": 2,
    "node": "u"
  }
];
const EXPECT_SILENCE = false;

/** The node a file belongs to: basename of its parent directory (matches the catalogue's node:<id> convention). */
const nodeOf = (filePath) => {
  const segs = filePath.split('/');
  return segs.length >= 2 ? segs[segs.length - 2] : '';
};

test('kotlin-top-level-fun-import-exact-fqn', async () => {
  await withParsedFiles(FILES, async (parsedFiles) => {
    const parsedByPath = new Map(FILES.map((f, i) => [f.path, parsedFiles[i]]));

    // Universe SymbolTable — real extractor.declarations() over every file (pass.ts step 4).
    const symbolTable = new SymbolTable();
    for (const f of FILES) {
      const extractor = extractorForLanguage(f.language);
      for (const decl of extractor.declarations(parsedByPath.get(f.path))) {
        symbolTable.declare(f.language, decl.symbolKey, f.path);
      }
    }

    const ownerIndex = { ownerOf: nodeOf };

    // Materialize the fixture onto disk so the real resolvePathToFile sees the exact layout
    // the catalogue documents (kotlin never emits a path hint, but the resolver requires it).
    const projectRoot = mkdtempSync(join(tmpdir(), 'grain-kt-matrix-'));
    try {
      for (const f of FILES) {
        const abs = join(projectRoot, f.path);
        mkdirSync(dirname(abs), { recursive: true });
        writeFileSync(abs, f.code, 'utf-8');
      }

      const resolver = makeResolver({
        ownerIndex,
        symbolTable,
        resolvePathToFile: makeResolvePathToFile(projectRoot, ownerIndex.ownerOf),
      });

      // Per file: real extractor.uses(), then the exact pass.ts ordered-candidate walk.
      const edges = [];
      for (const f of FILES) {
        const extractor = extractorForLanguage(f.language);
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
      const actual = new Set(edges.map(edgeKey));
      const expected = new Set(EXPECT_EDGES.map(edgeKey));

      // grain adaptation: vitest's expect(actual, msg).toContain(...) carries a custom failure
      // message that the harness's expect() has no parameter for — ported to node:assert.ok
      // with the identical message so a failing case still names the missing/unexpected edge.
      for (const e of EXPECT_EDGES) {
        assert.ok(actual.has(edgeKey(e)), `expected edge ${edgeKey(e)} not emitted (got ${[...actual].join(', ') || 'none'})`);
      }
      for (const a of actual) {
        assert.ok(expected.has(a), `unexpected cross-node edge ${a}`);
      }
      if (EXPECT_SILENCE && EXPECT_EDGES.length === 0) {
        assert.equal(edges.length, 0, `expected silence but emitted ${edges.map(edgeKey).join(', ')}`);
      }
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });
});
