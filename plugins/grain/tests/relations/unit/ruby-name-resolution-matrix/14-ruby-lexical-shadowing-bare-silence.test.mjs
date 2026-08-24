// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby-name-resolution-matrix.test.ts (MIT, same author).
// describe: MATRIX — load-path / ambiguity / shadowing silences (the master zero-FP guards)
// it: ruby-lexical-shadowing-bare-silence
// grain adaptation: inlines Yggdrasil's shared `runCase(id)` reference-case-runner pipeline
// directly against grain's harness primitives, embedding the catalogue case's `## Files` /
// `## Expect` verbatim — see 01-ruby-require-relative-path-edge.test.mjs for the full rationale.
//
// Rule (reference/relations/ruby/ruby-lexical-shadowing-bare-silence.md): inside any
// class/module body a BARE unqualified constant lexically resolves against the enclosing
// namespace first, so it is SUPPRESSED (C1) — never emitted, even when a same-named top-level
// constant exists elsewhere.
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
const nodeOf = (filePath) => {
  const segs = filePath.split('/');
  return segs.length >= 2 ? segs[segs.length - 2] : '';
};

test('ruby-lexical-shadowing-bare-silence', async () => {
  const files = [
    { path: 'src/helpers/helper.rb', language: 'ruby', code: 'class Helper\nend\n' },
    {
      path: 'src/orders/order.rb',
      language: 'ruby',
      code: 'class Order\n  def run\n    Helper.go\n  end\nend\n',
    },
  ];
  const expectEdges = [];
  const expectSilence = true;

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
