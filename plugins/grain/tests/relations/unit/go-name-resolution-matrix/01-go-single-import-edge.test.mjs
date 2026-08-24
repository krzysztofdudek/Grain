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

// grain adaptation: Yggdrasil's matrix suite drives runCase('<id>'), which loads the
// case's embedded fixture + expectation from a markdown reference catalogue
// (reference/relations/go/<id>.md) and runs it through the real extractor + resolver
// pipeline. grain has no reference-case-runner or catalogue, so each ported case
// inlines the catalogue's `## Files` fixture directly and reproduces the SAME pipeline
// with grain's vendored relations pieces: universe SymbolTable from
// extractor.declarations(), a real resolver via makeResolver/makeResolvePathToFile, and
// the identical ordered-candidate walk (resolveCandidateGroup) pass.ts runs. Node
// identity follows the catalogue convention: a file's node is the basename of its
// parent directory.
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

// Rule: a single `import "path"` declaration is the only edge-bearing Go form. The
// operand is the import PATH; resolution strips the go.mod `module` prefix to a
// repo-relative package DIRECTORY, then picks a representative `.go` file in exactly
// that directory. `import "example.com/m/billing"` under module `example.com/m`
// resolves to the directory `billing/` (node `billing`).
test('go-single-import-edge', async () => {
  const files = [
    { path: 'm/go.mod', code: 'module example.com/m\n' },
    { path: 'm/billing/charge.go', code: 'package billing\nfunc Charge() {}\n', language: 'go' },
    {
      path: 'm/app/main.go',
      code: 'package main\nimport "example.com/m/billing"\nfunc main() { billing.Charge() }\n',
      language: 'go',
    },
  ];
  const edges = await runGoCase(files);
  expect(edges.sort()).toEqual(['m/app/main.go:2->node:billing']);
});
