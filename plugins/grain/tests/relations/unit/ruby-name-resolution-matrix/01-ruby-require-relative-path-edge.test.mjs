// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby-name-resolution-matrix.test.ts (MIT, same author).
// describe: MATRIX — the path-precise link (require_relative is the only file-precise static link)
// it: ruby-require-relative-path-edge
//
// grain adaptation: the source `it` calls a shared `runCase(id)` helper that loads a case
// from Yggdrasil's `reference/relations/ruby/<id>.md` catalogue and drives it through
// Yggdrasil's own reference-case-runner (extractor.declarations() → SymbolTable →
// buildOwnerIndex → makeResolver → per-file extractor.uses() → resolveCandidateGroup →
// edge assertions). Neither the catalogue file nor `runCase`/`buildOwnerIndex` are ported
// to grain's `_unit-harness.mjs`. This file inlines the SAME pipeline directly against the
// harness's own primitives (extractorForLanguage, SymbolTable, makeResolver,
// resolveCandidateGroup, makeResolvePathToFile) with the case's `## Files` and `## Expect`
// content (from the referenced catalogue doc) embedded verbatim, so the case still runs
// end-to-end through grain's REAL relation pass.
//
// Rule (from reference/relations/ruby/ruby-require-relative-path-edge.md): `require_relative
// '<literal>'` is the ONLY file-precise static link in Ruby — the resolver joins the literal
// onto dirname(fromFile), appends `.rb`, and checks existence.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import {
  withParsedFiles,
  extractorForLanguage,
  SymbolTable,
  makeResolver,
  resolveCandidateGroup,
  makeResolvePathToFile,
} from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
/** The node a file belongs to: basename of its parent directory (catalogue convention). */
const nodeOf = (filePath) => {
  const segs = filePath.split('/');
  return segs.length >= 2 ? segs[segs.length - 2] : '';
};

test('ruby-require-relative-path-edge', async () => {
  const files = [
    { path: 'src/services/order_service.rb', language: 'ruby', code: 'class OrderService\nend\n' },
    {
      path: 'src/orders/order.rb',
      language: 'ruby',
      code: "require_relative '../services/order_service'\n",
    },
  ];
  const expectEdges = [{ fromFile: 'src/orders/order.rb', line: 1, node: 'services' }];
  const expectSilence = false;

  const root = mkdtempSync(path.join(tmpdir(), 'ruby-matrix-'));
  try {
    for (const f of files) {
      const abs = path.join(root, f.path);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, f.code, 'utf-8');
    }

    await withParsedFiles(files, async (parsedFiles) => {
      const parsedByPath = new Map(files.map((f, i) => [f.path, parsedFiles[i]]));

      const symbolTable = new SymbolTable();
      for (const f of files) {
        for (const decl of rubyExtractor.declarations(parsedByPath.get(f.path))) {
          symbolTable.declare('ruby', decl.symbolKey, f.path);
        }
      }

      const ownerIndex = { ownerOf: (file) => nodeOf(file) };
      const resolver = makeResolver({
        ownerIndex,
        symbolTable,
        resolvePathToFile: makeResolvePathToFile(root, ownerIndex.ownerOf),
      });

      const edges = [];
      for (const f of files) {
        const parsed = parsedByPath.get(f.path);
        const fromNode = nodeOf(f.path);
        for (const dep of rubyExtractor.uses(parsed)) {
          const ownerNode = resolveCandidateGroup(dep.candidates, resolver, f.path, 'ruby');
          if (ownerNode !== undefined && ownerNode !== fromNode) {
            edges.push({ fromFile: f.path, line: dep.line, node: ownerNode });
          }
        }
      }

      const edgeKey = (e) => `${e.fromFile}:${e.line}->${e.node}`;
      const actual = new Set(edges.map(edgeKey));
      const expected = new Set(expectEdges.map(edgeKey));
      for (const e of expectEdges) {
        assert.ok(actual.has(edgeKey(e)), `expected edge ${edgeKey(e)} not emitted (got ${[...actual].join(', ') || 'none'})`);
      }
      for (const a of actual) {
        assert.ok(expected.has(a), `unexpected cross-node edge ${a}`);
      }
      if (expectSilence) {
        assert.equal(edges.length, 0, `expected silence but emitted ${edges.map(edgeKey).join(', ')}`);
      }
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
