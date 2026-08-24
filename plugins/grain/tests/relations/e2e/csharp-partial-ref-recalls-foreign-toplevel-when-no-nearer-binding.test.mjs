// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: The same partially-qualified pattern, with no nearer intra-node binding available, must fall through the ordered group to the verbatim foreign top-level candidate and be detected.
// grain adaptation: grain's C#/Ruby symbol edges carry kind 'import' (Yggdrasil told construct/call/type-ref apart in its type gate, which grain does not port); the EDGE is the invariant here.
// Invariant: Same `new Models.Order()` inside `namespace App.Services;`, but this time n1 has NO intra-node App.Data.Models binding (no Data.cs) — only the top-level Models.Order in n2 exists. The verbatim candidate (last in the ordered group) is the one that resolves -> the real cross-node edge IS detected: undeclared -> refused (exit 1, mentions 'n2' and 'src/n1/Order.cs'); declared uses: n2 -> passes.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("csharp-partial-ref-recalls-foreign-toplevel-when-no-nearer-binding", () => {
  const fx = {
  "src/n1/Order.cs": "namespace App.Services;\npublic class C { void M() { var o = new Models.Order(); } }\n",
  "src/n2/Order.cs": "namespace Models;\npublic class Order { }\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/n1/Order.cs", "src/n2/Order.cs", null);
  } finally { cleanup(); }
});
