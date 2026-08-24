// Ported from Yggdrasil source/cli/tests/unit/relations/extractors/ruby.test.ts (MIT, same author).
// describe: ruby SYMBOL-TABLE resolution — unique resolves, reopened silences
// grain adaptation: Yggdrasil's `ensureLoaderRegistered()` registers a Node loader hook
// for its own AST layer; grain's harness parses directly via `withParsedFiles` (backed by
// grain's tree-sitter runtime), so no equivalent registration step is needed or ported.
import { test } from 'node:test';
import { expect, withParsedFiles, extractorForLanguage, SymbolTable, makeResolver } from '../_unit-harness.mjs';

const rubyExtractor = extractorForLanguage('ruby');
/** A Ruby (path, code) pair as a withParsedFiles spec. */
const rb = (path, code) => ({ path, code, language: 'ruby' });

test('a UNIQUE constant resolves through the table to its defining file', async () => {
  await withParsedFiles(
    [
      rb('src/a/base_service.rb', 'class BaseService\nend\n'),
      rb('src/b/order_service.rb', 'class OrderService < BaseService\nend\n'),
    ],
    ([fileA, consumer]) => {
      const st = new SymbolTable();
      for (const d of rubyExtractor.declarations(fileA)) st.declare('ruby', d.symbolKey, fileA.path);

      expect(st.resolveUnique('ruby', 'BaseService')).toBe('src/a/base_service.rb');

      const importHint = rubyExtractor.uses(consumer).find((u) => u.candidates[0].kind === 'symbol');
      expect(importHint.candidates[0]).toEqual({ kind: 'symbol', symbolKey: 'BaseService' });

      const ownerIndex = { ownerOf: (f) => (f === 'src/a/base_service.rb' ? 'a' : undefined) };
      const resolver = makeResolver({
        ownerIndex,
        symbolTable: st,
        resolvePathToFile: () => undefined,
      });
      expect(resolver.resolve(importHint.candidates[0], consumer.path, 'ruby')).toEqual({
        ownerNode: 'a',
        resolvedFile: 'src/a/base_service.rb',
      });
    },
  );
});
