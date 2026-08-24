// Relation conformance — ported 1:1 from Yggdrasil's cli-relations.test.ts (MIT, same author), it "4: high-fan-out — lowering max_direct_relations flags a node with multiple relations".
// Case: lowering quality.max_direct_relations below a node's declared relation count flags that node with a high-fan-out diagnostic.
// grain adaptation: max_direct_relations is a configured quality threshold in yg-config.yaml with no grain equivalent — grain never counts or silences edges based on a file's outbound reference count; it reports every resolvable reference regardless of how many there are.
// grain adaptation: the portable invariant is that order-service.ts genuinely references three separate targets and all three edges are detected, independent of any threshold.
// Invariant: src/orders/order-service.ts imports from auth/auth-api.ts, users/user-repo.ts and payments/payment-gateway.ts; all three edges are detected with no fan-out limit applied.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations--04-high-fan-out", () => {
  const fx = {
    "src/auth/auth-api.ts": "export const authApi = 1;\n",
    "src/users/user-repo.ts": "export class UserRepo {}\n",
    "src/payments/payment-gateway.ts": "export const paymentGateway = 1;\n",
    "src/orders/order-service.ts": "import { authApi } from '../auth/auth-api.js';\nimport { UserRepo } from '../users/user-repo.js';\nimport { paymentGateway } from '../payments/payment-gateway.js';\nexport const wiring = { authApi, UserRepo, paymentGateway };\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/orders/order-service.ts", "src/auth/auth-api.ts", "import");
    expectEdge(edges, "src/orders/order-service.ts", "src/users/user-repo.ts", "import");
    expectEdge(edges, "src/orders/order-service.ts", "src/payments/payment-gateway.ts", "import");
  } finally { cleanup(); }
});
