// Relation conformance — ported 1:1 from Yggdrasil's cli-relations.test.ts (MIT, same author), it "3: relation-target-forbidden — uses pointing at a disallowed target type fails check".
// Case: a `uses` relation pointing at a node whose TYPE the architecture disallows as a target (a `module` parent, not a `service`) fails check with relation-target-forbidden.
// grain adaptation: relation-target-forbidden gates a relation's target by the declared node TYPE in yg-architecture.yaml; grain has no node-type concept and applies no such allow-list — it reports every reference it can resolve, full stop.
// grain adaptation: translated to source: services/orders/orders.ts importing from the parent services/index.ts (the organizational module yg would forbid as a `uses` target) is an entirely ordinary cross-module import in grain and IS detected as an edge.
// Invariant: src/services/orders/orders.ts imports from the parent module's ../index.js; grain reports the edge with no target-type gating.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations--03-relation-target-forbidden", () => {
  const fx = {
    "src/services/index.ts": "export * from './payments/payments.js';\n",
    "src/services/payments/payments.ts": "export const gatewayId = 'pg-1';\n",
    "src/services/orders/orders.ts": "import * as services from '../index.js';\nexport const ref = services;\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/services/orders/orders.ts", "src/services/index.ts", "import");
  } finally { cleanup(); }
});
