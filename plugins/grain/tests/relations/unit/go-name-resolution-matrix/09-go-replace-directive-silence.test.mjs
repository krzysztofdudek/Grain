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

// grain adaptation: no reference-case-runner/catalogue in grain — this file inlines the
// case's `## Files` fixture and reproduces the real extractor+resolver pipeline directly
// (full rationale in 01-go-single-import-edge.test.mjs). Node identity: basename of a
// file's parent directory.
function nodeOf(filePath) {
  const segs = filePath.split('/');
  return segs.length >= 2 ? segs[segs.length - 2] : '';
}

async function runGoCase(files) {
  const dir = mkdtempSync(join(tmpdir(), 'go-matrix-'));
  try {
    for (const f of files) {
      const abs = join(dir, f.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, f.code, 'utf-8');
    }
    const sourceFiles = files.filter((f) => f.language);
    return await withParsedFiles(
      sourceFiles.map((f) => ({ path: f.path, code: f.code, language: f.language })),
      async (parsed) => {
        const byPath = new Map(sourceFiles.map((f, i) => [f.path, parsed[i]]));
        const symbolTable = new SymbolTable();
        for (const f of sourceFiles) {
          const ex = extractorForLanguage(f.language);
          for (const decl of ex.declarations(byPath.get(f.path))) {
            symbolTable.declare(f.language, decl.symbolKey, f.path);
          }
        }
        const ownerByFile = new Map(sourceFiles.map((f) => [f.path, nodeOf(f.path)]));
        const ownerOf = (file) => ownerByFile.get(file);
        const resolver = makeResolver({
          ownerIndex: { ownerOf },
          symbolTable,
          resolvePathToFile: makeResolvePathToFile(dir, ownerOf),
        });
        const edges = [];
        for (const f of sourceFiles) {
          const ex = extractorForLanguage(f.language);
          const fromNode = nodeOf(f.path);
          for (const dep of ex.uses(byPath.get(f.path))) {
            const ownerNode = resolveCandidateGroup(dep.candidates, resolver, f.path, f.language);
            if (ownerNode !== undefined && ownerNode !== fromNode) {
              edges.push(`${f.path}:${dep.line}->node:${ownerNode}`);
            }
          }
        }
        return edges;
      },
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// Rule: a main-module `replace example.com/other => ./vendored/other` makes the go
// toolchain resolve `example.com/other/pkg` to an in-repo directory. The resolver reads
// ONLY the `module` line of go.mod, never `replace` directives, so the imported path is
// gated as external → silence (a tolerated false-NEGATIVE, never a mis-bind).
test('go-replace-directive-silence', async () => {
  const files = [
    {
      path: 'm/go.mod',
      code: 'module example.com/m\n\nreplace example.com/other => ./vendored/other\n',
    },
    {
      path: 'm/vendored/other/pkg.go',
      code: 'package other\nfunc Helper() {}\n',
      language: 'go',
    },
    {
      path: 'm/app/main.go',
      code: 'package main\nimport "example.com/other"\nfunc main() { other.Helper() }\n',
      language: 'go',
    },
  ];
  const edges = await runGoCase(files);
  expect(edges).toEqual([]);
});
