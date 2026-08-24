// Reference-catalogue case `php-trap-alias-matching-current-ns-edge` (Yggdrasil reference/relations/php/php-trap-alias-matching-current-ns-edge.md), driven end-to-end
// through the real PHP extractor + PSR-4 resolver + owner index. Mirrors Yggdrasil's
// reference-case-runner.ts `runCase`, inlined here since Grain's unit harness has no catalogue loader:
// materialize the ## Files fixture, build a universe SymbolTable from extractor.declarations(), an
// owner index (node = file's parent-directory basename), then walk extractor.uses() candidates through
// the real resolveCandidateGroup and assert the exact cross-node edge set the catalogue's ## Expect documents.
//
// Rule: `namespace foo; use blah\blah as foo;` — the import resolves to the absolute FQN
// `blah\blah`, never the local alias `foo` (which happens to match the current namespace). The
// per-token usage duality (`new foo()` → `foo\name` current-ns; `foo::name()` → `blah\blah`
// import-wins) is usage-site and silent. The import edge is the FQN operand verbatim; the alias
// coinciding with the namespace changes nothing.
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

test("php-trap-alias-matching-current-ns-edge", async () => {
  const files = [
    { path: "lib/Pkg/blah.php", language: "php", code: "<?php\nnamespace blah;\nclass blah {}\n" },
    { path: "src/foo/C.php", language: "php", code: "<?php\nnamespace foo;\nuse blah\\blah as foo;\nclass C {}\n" },
  ];
  const configFiles = [
    { path: "composer.json", code: "{ \"autoload\": { \"psr-4\": { \"blah\\\\\": \"lib/Pkg/\", \"App\\\\\": \"src/\" } } }\n" },
  ];
  const expectEdges = [
    { fromFile: "src/foo/C.php", line: 3, node: "Pkg" },
  ];
  const expectSilence = false;

  // Node identity: the basename of a file's parent directory (matches the catalogue's node:<id> convention).
  const nodeOf = (filePath) => {
    const segs = filePath.split('/');
    return segs.length >= 2 ? segs[segs.length - 2] : '';
  };

  const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'grain-php-matrix-'));
  for (const f of [...files, ...configFiles]) {
    const abs = path.join(projectRoot, f.path);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, f.code, 'utf-8');
  }

  try {
    await withParsedFiles(files, async (parsedFiles) => {
      const parsedByPath = new Map(parsedFiles.map((p) => [p.path, p]));

      // Universe SymbolTable — real extractor.declarations() over every source file.
      const symbolTable = new SymbolTable();
      for (const f of files) {
        const extractor = extractorForLanguage(f.language);
        const parsed = parsedByPath.get(f.path);
        for (const decl of extractor.declarations(parsed)) {
          symbolTable.declare(f.language, decl.symbolKey, f.path);
        }
      }

      // Owner index over the in-memory project: one node per file's parent directory, exact-path
      // membership only (the catalogue never nests one node's files under another's).
      const ownedFiles = new Set(files.map((f) => f.path));
      const ownerIndex = { ownerOf: (file) => (ownedFiles.has(file) ? nodeOf(file) : undefined) };

      // Real resolver, pointed at the materialized project so PSR-4 (composer.json) resolution is
      // byte-identical to the production path.
      const resolver = makeResolver({
        ownerIndex,
        symbolTable,
        resolvePathToFile: makeResolvePathToFile(projectRoot, ownerIndex.ownerOf),
      });

      // Real extractor.uses() + the exact ordered-candidate walk (resolveCandidateGroup) → resolved cross-node edges.
      const edges = [];
      for (const f of files) {
        const extractor = extractorForLanguage(f.language);
        const parsed = parsedByPath.get(f.path);
        const fromNode = nodeOf(f.path);
        for (const dep of extractor.uses(parsed)) {
          const ownerNode = resolveCandidateGroup(dep.candidates, resolver, f.path, f.language);
          if (ownerNode !== undefined && ownerNode !== fromNode) {
            edges.push({ fromFile: f.path, line: dep.line, node: ownerNode });
          }
        }
      }

      const edgeKey = (e) => `${e.fromFile}:${e.line}->${e.node}`;
      // grain adaptation: harness toContain() only supports arrays/strings, not Sets — dedupe via Set then compare as arrays.
      const actualList = [...new Set(edges.map(edgeKey))];
      const expectedList = [...new Set(expectEdges.map(edgeKey))];

      for (const e of expectEdges) {
        expect(actualList).toContain(edgeKey(e));
      }
      for (const a of actualList) {
        expect(expectedList).toContain(a);
      }
      if (expectSilence && expectEdges.length === 0) {
        expect(edges).toHaveLength(0);
      }
    });
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
