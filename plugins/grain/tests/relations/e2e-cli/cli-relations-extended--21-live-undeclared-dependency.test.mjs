// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "D1: a plain check catches an undeclared dependency live; declaring the relation clears it; aspect verdicts never move".
// Case: relation conformance is computed LIVE every run: a plain `yg check` (no --approve) catches a real, undeclared cross-node import directly; declaring the relation clears the error; the node's aspect verdicts are byte-identical across the whole sequence (a relation is not an aspect-verdict input).
// grain adaptation: the declare/undeclare half is entirely about a yg-node.yaml `relations:` block — grain has no such declaration surface at all, so there is nothing to add or remove; grain unconditionally live-detects the real import on every run, which makes the 'declared vs undeclared' distinction moot by construction.
// grain adaptation: the aspect-verdict-stability half has no grain equivalent (no aspects, no lock) and is not portable.
// Invariant: src/services/orders.ts genuinely imports charge from src/services/payments.ts; the edge is detected live, unconditionally.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--21-live-undeclared-dependency", () => {
  const fx = {
    "src/services/payments.ts": "export function charge(id, total) { return total; }\n",
    "src/services/orders.ts": "import { charge } from './payments.js';\nexport function createOrder(id, total) { charge(id, total); return { id, total }; }\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/services/orders.ts", "src/services/payments.ts", "import");
  } finally { cleanup(); }
});
