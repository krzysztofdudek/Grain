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

test('a REOPENED (ambiguous) constant silences — resolveUnique undefined, no flag', async () => {
  // Two files each define `Widget` (reopening / same name across nodes) → ambiguous.
  await withParsedFiles(
    [
      rb('src/x/widget.rb', 'class Widget\nend\n'),
      rb('src/y/widget.rb', 'class Widget\nend\n'),
      rb('src/z/use.rb', 'x = Widget\n'),
    ],
    ([fileX, fileY, consumer]) => {
      const st = new SymbolTable();
      for (const f of [fileX, fileY]) {
        for (const d of rubyExtractor.declarations(f)) st.declare('ruby', d.symbolKey, f.path);
      }

      expect(st.resolveUnique('ruby', 'Widget')).toBeUndefined();

      const ownerIndex = { ownerOf: () => 'someNode' };
      const resolver = makeResolver({
        ownerIndex,
        symbolTable: st,
        resolvePathToFile: () => undefined,
      });
      const hint = rubyExtractor.uses(consumer).find((u) => u.candidates[0].kind === 'symbol');
      expect(resolver.resolve(hint.candidates[0], consumer.path, 'ruby')).toBeUndefined();
    },
  );
});
