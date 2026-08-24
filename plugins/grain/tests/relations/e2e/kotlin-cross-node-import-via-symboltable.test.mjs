// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: The FIRST language resolved through the shared SymbolTable rather than a path mapping: an FQN import is detected via symbol resolution even though the source directory is decoupled from the package name.
// Invariant: Packages are deliberately decoupled from directories (src/a, src/b vs com.x.a, com.x.b) to force resolution through the shared SymbolTable instead of a naive path mapping. `import com.x.b.Bar` resolves via the SymbolTable; undeclared -> refused (exit 1, mentions 'b' and 'src/a/Foo.kt'); declared uses: b -> check --approve passes AND a subsequent plain `yg check` (no --approve, no re-parsing) stays verified — the parse-free symbol re-validation must reconstruct the identical fingerprint the approve pass sealed.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("kotlin-cross-node-import-via-symboltable", () => {
  const fx = {
  "src/a/Foo.kt": "package com.x.a\nimport com.x.b.Bar\nclass Foo {\n  val bar: Bar? = null\n}\n",
  "src/b/Bar.kt": "package com.x.b\nclass Bar\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/a/Foo.kt", "src/b/Bar.kt", "import");
  } finally { cleanup(); }
});
