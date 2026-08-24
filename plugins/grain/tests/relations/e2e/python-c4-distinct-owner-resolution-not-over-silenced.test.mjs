// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: The ancestor-root false-positive fix must not over-silence a genuinely resolvable cross-node import that has exactly one candidate file.
// Invariant: src/b/bar.py is the ONLY file `b.bar` can resolve to (no self-shadowing bar.py exists under src/a/), so the C4 distinct-candidate-set guard still returns it as the resolution target instead of silencing on ambiguity; with a's declared uses: b relation this satisfies the edge and check --approve passes clean (exit 0). Guards against the ancestor-root fix over-silencing a real, unambiguous cross-node dependency.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("python-c4-distinct-owner-resolution-not-over-silenced", () => {
  const fx = {
  "src/a/foo.py": "from b.bar import x\n\nfoo = x\n",
  "src/b/bar.py": "x = 1\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/a/foo.py", "src/b/bar.py", "import");
  } finally { cleanup(); }
});
