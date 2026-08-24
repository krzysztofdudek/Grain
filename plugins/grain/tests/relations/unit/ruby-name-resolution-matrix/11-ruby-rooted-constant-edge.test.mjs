// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby-name-resolution-matrix.test.ts (MIT, same author).
// describe: MATRIX — FQN keying & shadow-free positions (compact def / pattern-match / ::-rooted)
// it: ruby-rooted-constant-edge
// grain adaptation: inlines Yggdrasil's shared `runCase(id)` reference-case-runner pipeline
// directly against grain's harness primitives, embedding the catalogue case's `## Files` /
// `## Expect` verbatim — see 01-ruby-require-relative-path-edge.test.mjs for the full rationale.
//
// Rule (reference/relations/ruby/ruby-rooted-constant-edge.md): a `::`-rooted reference
// (`< ::Top::Base`) is ABSOLUTE — shadow-free even inside a namespace; the extractor strips a
// single leading `::` so the key `Top::Base` matches a definition recorded without it.
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

test('ruby-rooted-constant-edge', async () => {
  const files = [
    { path: 'src/toplib/base.rb', language: 'ruby', code: 'module Top\n  class Base\n  end\nend\n' },
    { path: 'src/orders/service.rb', language: 'ruby', code: 'class Service < ::Top::Base\nend\n' },
  ];
  const expectEdges = [{ fromFile: 'src/orders/service.rb', line: 1, node: 'toplib' }];
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
