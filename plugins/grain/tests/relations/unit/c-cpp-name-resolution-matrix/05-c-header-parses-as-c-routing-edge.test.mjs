import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  withParsedFiles,
  extractorForLanguage,
  SymbolTable,
  makeResolver,
  resolveCandidateGroup,
  makeResolvePathToFile,
} from '../_unit-harness.mjs';

// ---- reference-case-runner, inlined (ported from Yggdrasil's tests/unit/relations/reference-case-runner.ts).
// Runs one case end-to-end through the REAL relation pass: the real C/C++ extractor's
// declarations()/uses(), a directory-basename owner index (node = basename of a file's
// parent directory, matching the catalogue's `node:<id>` convention — Yggdrasil's
// buildOwnerIndex keys nodes by this same nodeOf() exactly), a real SymbolTable, and the
// real resolver — never a reimplementation of name resolution. The embedded files are
// materialized into a throwaway temp project root so the REAL makeResolvePathToFile sees
// the exact on-disk layout the catalogue documents; grain has no vendored owner-index
// module, so the owner index here is the same nodeOf() function applied directly (every
// node's file set in these single-node-per-directory fixtures is exactly nodeOf(file)).
function nodeOf(filePath) {
  const segs = filePath.split('/');
  return segs.length >= 2 ? segs[segs.length - 2] : '';
}

async function runCase(files, expectEdges, expectSilence) {
  return withParsedFiles(
    files.map((f) => ({ path: f.path, code: f.code, language: f.language })),
    async (parsedFiles) => {
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

      const ownerIndex = { ownerOf: (file) => nodeOf(file) };

      const projectRoot = mkdtempSync(path.join(os.tmpdir(), 'grain-refcase-'));
      try {
        for (const f of files) {
          const abs = path.join(projectRoot, f.path);
          mkdirSync(path.dirname(abs), { recursive: true });
          writeFileSync(abs, f.code, 'utf-8');
        }

        const resolver = makeResolver({
          ownerIndex,
          symbolTable,
          resolvePathToFile: makeResolvePathToFile(projectRoot, ownerIndex.ownerOf),
        });

        const edges = [];
        for (const f of files) {
          const extractor = extractorForLanguage(f.language);
          if (!extractor) continue;
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
        const actual = new Set(edges.map(edgeKey));
        const expected = new Set(expectEdges.map(edgeKey));

        for (const e of expectEdges) {
          assert.ok(
            actual.has(edgeKey(e)),
            `expected edge ${edgeKey(e)} not emitted (got ${[...actual].join(', ') || 'none'})`,
          );
        }
        for (const a of actual) {
          assert.ok(expected.has(a), `unexpected cross-node edge ${a}`);
        }
        if (expectSilence && expectEdges.length === 0) {
          assert.equal(edges.length, 0, `expected silence but emitted ${edges.map(edgeKey).join(', ')}`);
        }
      } finally {
        rmSync(projectRoot, { recursive: true, force: true });
      }
    },
  );
}

test('c-header-parses-as-c-routing-edge', async () => {
  await runCase(
    [
      { path: 'shared/config.h', language: 'c', code: '#pragma once\nstruct Config { int n; };\n' },
      {
        path: 'app/main.c',
        language: 'c',
        code: '#include "../shared/config.h"\nint main(void) { struct Config c; return 0; }\n',
      },
    ],
    [{ fromFile: 'app/main.c', line: 1, node: 'shared' }],
    false,
  );
});
