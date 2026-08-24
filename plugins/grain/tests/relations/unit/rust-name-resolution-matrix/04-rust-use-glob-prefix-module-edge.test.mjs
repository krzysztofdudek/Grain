import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { withParsedFiles, extractorForLanguage, SymbolTable, makeResolver, resolveCandidateGroup, makeResolvePathToFile } from '../_unit-harness.mjs';

// grain adaptation: ported from Yggdrasil's reference-case-runner.ts `runCase('rust-use-glob-
// prefix-module-edge')`, driven by reference/relations/rust/rust-use-glob-prefix-module-edge.md.
// Grain has no reference-catalogue file or owner-index module, so the case's ## Files / ## Expect
// are embedded verbatim below and the edge-detection pipeline (SymbolTable + real resolver +
// resolveCandidateGroup; a node is the basename of a file's parent directory, matching the
// catalogue's node:<id> convention) is reimplemented over the exported unit-harness primitives,
// scoped to Rust (no C# global-using tier needed).

const files = [
  { path: 'src/a/b.rs', language: 'rust', code: 'pub struct C;\npub struct D;\n' },
  { path: 'src/c/use.rs', language: 'rust', code: 'use crate::a::b::*;\n' },
];
const configFiles = [
  { path: 'Cargo.toml', code: '[package]\nname = "mycrate"\n' },
];
const expectEdges = [{ fromFile: 'src/c/use.rs', line: 1, node: 'a' }];
const expectSilence = false;

test('rust-use-glob-prefix-module-edge', async () => {
  const root = mkdtempSync(path.join(tmpdir(), 'rust-matrix-'));
  try {
    for (const f of [...files, ...configFiles]) {
      const abs = path.join(root, f.path);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, f.code, 'utf-8');
    }

    await withParsedFiles(files, async parsedFiles => {
      const nodeOf = p => { const segs = p.split('/'); return segs.length >= 2 ? segs[segs.length - 2] : ''; };
      const extractor = extractorForLanguage('rust');
      const symbolTable = new SymbolTable();
      files.forEach((f, i) => { for (const decl of extractor.declarations(parsedFiles[i])) symbolTable.declare('rust', decl.symbolKey, f.path); });

      const resolver = makeResolver({
        ownerIndex: { ownerOf: nodeOf },
        symbolTable,
        resolvePathToFile: makeResolvePathToFile(root, nodeOf),
      });

      const edges = [];
      files.forEach((f, i) => {
        const fromNode = nodeOf(f.path);
        for (const dep of extractor.uses(parsedFiles[i])) {
          const ownerNode = resolveCandidateGroup(dep.candidates, resolver, f.path, 'rust');
          if (ownerNode !== undefined && ownerNode !== fromNode) edges.push({ fromFile: f.path, line: dep.line, node: ownerNode });
        }
      });

      const edgeKey = e => `${e.fromFile}:${e.line}->${e.node}`;
      const actual = new Set(edges.map(edgeKey));
      const expected = new Set(expectEdges.map(edgeKey));
      for (const e of expectEdges) assert.ok(actual.has(edgeKey(e)), `expected edge ${edgeKey(e)} not emitted (got ${[...actual].join(', ') || 'none'})`);
      for (const a of actual) assert.ok(expected.has(a), `unexpected cross-node edge ${a}`);
      if (expectSilence) assert.equal(edges.length, 0, `expected silence but emitted ${edges.map(edgeKey).join(', ')}`);
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
