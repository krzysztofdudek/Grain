// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: An all-type-only import (`import { type X } from ...}`) is a dependency like any import and gives an edge.
// Invariant: the import is entirely type-only (`import { type X } ...`) and erases at compile time, but a.ts compiles only against b's types, so it depends on b and the edge is reported (Yggdrasil 6.1.0: type-only imports are dependencies).
import { test } from 'node:test';
import { edgesOf, expectEdge } from '../harness.mjs';

test("typescript-type-only-import-edge", () => {
  const fx = {
  "src/a/foo.ts": "import { type X } from '../b/bar.js';\nexport type Y = X;\n",
  "src/b/bar.ts": "export const x = 1;\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/a/foo.ts", "src/b/bar.ts");
  } finally { cleanup(); }
});
