// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "D2: removing a declared relation re-introduces the live error but never touches the aspect verdicts".
// Case: symmetric to D1: starting WITH the relation declared and green, removing it re-introduces the live undeclared-dependency error on a plain `yg check`; the node's aspect verdicts stay unchanged; and no relation cache leaks into any of the split lock files (relations are never cached).
// grain adaptation: as in D1, the declare/undeclare distinction is moot in grain (no declaration surface to remove) and the aspect-verdict half has no grain equivalent.
// grain adaptation: the 'no relation cache leaks into the lock' assertion is inherently vacuous for grain: grain keeps no lock/verdict file of any kind (confirmed: nothing under .grain/ persists a relation verdict) — there is no lock to leak into. The portable invariant instead: two independent runs against the identical real dependency detect the identical edge, proving there is nothing cached to go stale or to re-approve.
// Invariant: src/services/orders.ts -> src/services/payments.ts is detected identically across two independent export runs of the same fixture.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--22-relation-cascade-removal", () => {
  const fx = {
    "src/services/payments.ts": "export function charge(id, total) { return total; }\n",
    "src/services/orders.ts": "import { charge } from './payments.js';\nexport function createOrder(id, total) { charge(id, total); return { id, total }; }\n"
  };
  const r1 = edgesOf(fx);
  try {
    expectEdge(r1.edges, "src/services/orders.ts", "src/services/payments.ts", "import");
  } finally { r1.cleanup(); }
  const r2 = edgesOf(fx);
  try {
    expectEdge(r2.edges, "src/services/orders.ts", "src/services/payments.ts", "import");
  } finally { r2.cleanup(); }
});
