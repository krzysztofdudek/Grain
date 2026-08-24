// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: An absolute dotted-module cross-node import (`from b.bar import x`, src/ as root) is detected live and gates on the declared uses relation.
// Invariant: `from b.bar import x` (absolute dotted module resolved against src/ as the module root) is a real cross-node dependency; undeclared -> refused (exit 1, message names both 'b' and 'src/a/foo.py'); declared uses: b -> check --approve passes.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("python-cross-node-import-detected", () => {
  const fx = {
  "src/a/foo.py": "from b.bar import x\n\nfoo = x\n",
  "src/b/bar.py": "x = 1\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/a/foo.py", "src/b/bar.py", "import");
  } finally { cleanup(); }
});
