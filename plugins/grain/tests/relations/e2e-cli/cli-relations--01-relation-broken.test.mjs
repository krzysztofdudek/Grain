// Relation conformance — ported 1:1 from Yggdrasil's cli-relations.test.ts (MIT, same author), it "1: relation-broken — check fails when a relation target does not exist".
// Case: a YAML-declared relation whose target node does not exist in the model fails check with relation-broken.
// grain adaptation: relation-broken fires against a yg-node.yaml relation entry whose target node is absent from the model — a pure model-layer concept (no yg-architecture/yg-node files exist in grain).
// grain adaptation: the nearest source-level analog is an import whose target module has no corresponding file anywhere in the repo; grain must resolve this to silence (no phantom edge, no crash), never a fabricated binding.
// Invariant: src/orders/broken-service.ts imports from '../nonexistent/missing-target.js', which has no file anywhere in the fixture. No edge is reported from broken-service.ts to it.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations--01-relation-broken", () => {
  const fx = {
    "src/orders/broken-service.ts": "import { x } from '../nonexistent/missing-target.js';\nexport const y = x;\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    // this case expects SILENCE — the target does not exist anywhere in the fixture
    forbidEdge(edges, "src/orders/broken-service.ts", "src/nonexistent/missing-target.ts");
  } finally { cleanup(); }
});
