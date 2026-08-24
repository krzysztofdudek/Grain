// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: A cross-node relative ES import is detected live (not cached) and gates check --approve/check on the declared uses relation.
// Invariant: import { x } from '../b/bar.js' (NodeNext .js specifier) is a real cross-node dependency and must be detected as an edge every run — declaring uses: b in node a's yg-node.yaml clears the violation, but the edge itself is recomputed live on every invocation, including a plain `yg check` with no --approve, and is never cached in the lock (no relation cache in any of the split lock files).
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("typescript-cross-node-import-live-detection", () => {
  const fx = {
  "src/a/foo.ts": "import { x } from '../b/bar.js';\nexport const foo = x;\n",
  "src/b/bar.ts": "export const x = 1;\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/a/foo.ts", "src/b/bar.ts", "import");
  } finally { cleanup(); }
});
