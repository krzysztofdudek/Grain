// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "C2: impact --node reports direct and transitive dependents through a uses chain".
// Case: `yg impact --node` reports the relational blast radius of a target: direct dependents, transitive dependents through a chain of `uses` relations, and the aggregate node count.
// grain adaptation: `yg impact` is a CLI-computed transitive closure with no grain equivalent — grain's export reports only DIRECT edges, never a transitive/blast-radius rollup.
// Invariant: p -> c -> b: p imports c, c imports b, but p does NOT import b directly — only the two direct edges are detected, and no direct p -> b edge exists despite the transitive relationship.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--17-impact-transitive-chain", () => {
  const fx = {
    "src/app/p/service.ts": "import { c } from '../c/service.js';\nexport const p = c;\n",
    "src/app/c/service.ts": "import { b } from '../b/service.js';\nexport const c = b;\n",
    "src/app/b/service.ts": "export const b = 1;\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/p/service.ts", "src/app/c/service.ts", "import");
    expectEdge(edges, "src/app/c/service.ts", "src/app/b/service.ts", "import");
    forbidEdge(edges, "src/app/p/service.ts", "src/app/b/service.ts");
  } finally { cleanup(); }
});
