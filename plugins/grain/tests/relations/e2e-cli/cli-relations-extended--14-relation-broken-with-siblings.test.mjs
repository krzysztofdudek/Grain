// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "B1: a relation to a nonexistent target node yields relation-broken".
// Case: a relation to a nonexistent target node is relation-broken, attributed to the declaring node, with a hint listing the sibling nodes that DO exist under the same parent prefix.
// grain adaptation: the 'existing siblings' hint is CLI-rendered output text with no grain equivalent. The portable invariant is that an unresolvable reference stays silent WITHOUT poisoning detection of the other, valid references in the same file — a real sibling import in the same file still resolves normally alongside the broken one.
// Invariant: src/app/p.ts imports both a real sibling (c.ts, resolved) and a nonexistent module (ghost.js, silent); the real edge is detected and the broken one stays silent.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--14-relation-broken-with-siblings", () => {
  const fx = {
    "src/app/c.ts": "export const real = 1;\n",
    "src/app/p.ts": "import { real } from './c.js';\nimport { ghost } from './ghost.js';\nexport const y = real;\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/p.ts", "src/app/c.ts", "import");
    forbidEdge(edges, "src/app/p.ts", "src/app/ghost.ts");
  } finally { cleanup(); }
});
