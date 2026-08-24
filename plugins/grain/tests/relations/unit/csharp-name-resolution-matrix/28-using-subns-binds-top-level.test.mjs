// Ported 1:1 from Yggdrasil's csharp-name-resolution-matrix.test.ts (source/cli/tests/unit/relations/extractors/).
// Each `it` there is `runCase('<id>')`, whose sole input is a reference-catalogue doc
// (reference/relations/csharp/<id>.md): embedded `## Files` fixtures + a documented `## Expect`
// outcome, driven end-to-end through the real extractor + SymbolTable + resolver pipeline
// (Yggdrasil's reference-case-runner.ts). The catalogue doc content is inlined here verbatim as
// the `files` / `edges` / `silence` data below; the runner pipeline itself is reproduced inline
// (see runCase) since the harness has no catalogue-doc reader and no buildOwnerIndex — node
// identity (basename of a file's parent dir) and ownership (exact declared-file match) are
// reproduced directly, equivalent to Yggdrasil's buildOwnerIndex over this doc's per-file mapping.
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
  csharp,
} from '../_unit-harness.mjs';

// Shared matrix-suite runner (Yggdrasil's reference-case-runner.ts `runCase`, ported inline —
// every it in this suite drives the identical pipeline, so it is duplicated verbatim per file):
// materialize the case's \`## Files\` into a temp project, build the universe SymbolTable from the
// real extractor's declarations(), run the C# global-using pre-pass, then drive the REAL
// resolver (makeResolver + resolveCandidateGroup) over the real extractor's uses(). Asserts every
// expected edge is emitted and that no unexpected cross-node edge appears.
async function runCase({ files, edges: expectEdges = [], silence = false }) {
  const nodeOf = (p) => { const segs = p.split('/'); return segs.length >= 2 ? segs[segs.length - 2] : ''; };
  const dir = mkdtempSync(join(tmpdir(), 'grain-unit-rel-'));
  try {
    for (const f of files) {
      const abs = join(dir, f.path);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, f.code, 'utf8');
    }
    await withParsedFiles(files.map(f => ({ path: f.path, code: f.code, language: f.language })), async (parsedFiles) => {
      const byPath = new Map(files.map((f, i) => [f.path, parsedFiles[i]]));

      // universe SymbolTable — real extractor.declarations() over every file
      const symbolTable = new SymbolTable();
      for (const f of files) {
        const ex = extractorForLanguage(f.language);
        if (!ex) continue;
        for (const decl of ex.declarations(byPath.get(f.path))) symbolTable.declare(f.language, decl.symbolKey, f.path);
      }

      // C# global-using pre-pass: namespace prefixes AND project-wide aliases
      const globalUsings = new Set();
      const globalUsingAliasMap = new Map();
      for (const f of files) {
        if (f.language !== 'csharp') continue;
        for (const prefix of csharp.collectGlobalUsings(byPath.get(f.path))) globalUsings.add(prefix);
        for (const [name, fqn] of csharp.collectGlobalUsingAliases(byPath.get(f.path))) globalUsingAliasMap.set(name, fqn);
      }
      const globalUsingsList = [...globalUsings];
      const globalUsingAliasesList = [...globalUsingAliasMap.entries()];

      // owner index: node identity is the basename of a file's parent dir (matches the
      // catalogue's node:<id> convention); every mapping entry is an exact declared file path.
      const known = new Set(files.map(f => f.path));
      const ownerIndex = { ownerOf: (file) => known.has(file) ? nodeOf(file) : undefined };
      const resolver = makeResolver({ ownerIndex, symbolTable, resolvePathToFile: makeResolvePathToFile(dir, ownerIndex.ownerOf) });

      // real extractor.uses() (C# injects the global-using tier) -> real ordered-candidate walk
      const actualEdges = [];
      for (const f of files) {
        const ex = extractorForLanguage(f.language);
        if (!ex) continue;
        const parsed = byPath.get(f.path);
        const fromNode = nodeOf(f.path);
        const detected = f.language === 'csharp'
          ? csharp.csharpUses(parsed, { projectGlobalUsings: globalUsingsList, projectGlobalUsingAliases: globalUsingAliasesList })
          : ex.uses(parsed);
        for (const dep of detected) {
          const ownerNode = resolveCandidateGroup(dep.candidates, resolver, f.path, f.language);
          if (ownerNode !== undefined && ownerNode !== fromNode) actualEdges.push(f.path + ':' + dep.line + '->' + ownerNode);
        }
      }

      const actualSet = new Set(actualEdges);
      const expectedSet = new Set(expectEdges.map(e => e.file + ':' + e.line + '->' + e.node));
      for (const key of expectedSet) {
        expect(actualSet.has(key)).toBe(true); // expected edge not emitted (got: [...actualSet].join(', '))
      }
      for (const key of actualSet) {
        expect(expectedSet.has(key)).toBe(true); // unexpected cross-node edge
      }
      if (silence) expect(actualEdges).toHaveLength(0);
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("csharp-using-subns-binds-top-level", async () => {
  await runCase({
    files: [
    { path: "src/c/Use.cs", language: "csharp", code: `using A;
namespace App;
class C : B.Type { }
` },
    { path: "src/b/Type.cs", language: "csharp", code: `namespace B;
public class Type {}
` },
  ],
    edges: [{ file: "src/c/Use.cs", line: 3, node: "b" }],
    silence: false,
  });
});
