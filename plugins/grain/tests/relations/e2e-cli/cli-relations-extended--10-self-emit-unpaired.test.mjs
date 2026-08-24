// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "E5: a self emit without a self listens is event-unpaired".
// Case: a node that emits to itself WITHOUT a complementary self-listens is event-unpaired — the self-loop is held to the same pairing rule as a cross-node emit.
// grain adaptation: pairing has no grain equivalent (see E4). The node's only real code-level coupling is still just the ordinary edge to the shared bus it calls `emit` on — identical detection whether or not a matching `on` call is present.
// Invariant: src/app/selfnode.ts imports only emit from the shared bus; the edge to the bus is still detected.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--10-self-emit-unpaired", () => {
  const fx = {
    "src/infra/bus.ts": "export function emit(name, payload) {}\nexport function on(name, handler) {}\n",
    "src/app/selfnode.ts": "import { emit } from '../infra/bus.js';\nexport function tick() { emit('tick', {}); }\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/selfnode.ts", "src/infra/bus.ts", "import");
  } finally { cleanup(); }
});
