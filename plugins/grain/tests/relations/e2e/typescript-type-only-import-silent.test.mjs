// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: An all-type-only import (`import { type X } from ...}`) erases at compile time and must NOT be treated as a runtime dependency edge.
// Invariant: Node a declares no `uses` relation to b, but the import is entirely type-only (`import { type X } ...`) which erases at compile time — not a runtime dependency — so relation-undeclared-dependency must NOT fire; check --approve passes (exit 0).
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("typescript-type-only-import-silent", () => {
  const fx = {
  "src/a/foo.ts": "import { type X } from '../b/bar.js';\nexport type Y = X;\n",
  "src/b/bar.ts": "export const x = 1;\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    // this case expects SILENCE — only the forbid assertions below
    forbidEdge(edges, "src/a/foo.ts", "src/b/bar.ts");
  } finally { cleanup(); }
});
