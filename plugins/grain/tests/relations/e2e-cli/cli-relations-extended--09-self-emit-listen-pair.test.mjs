// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "E4: a node that emits and listens to itself is a valid event self-pair".
// Case: a single node that both emits AND listens to the same event on itself satisfies the pairing check within that one node.
// grain adaptation: self-pairing is declared metadata about the SAME node, not a code cycle — grain has no pairing concept. A file that both emits and listens via the shared bus is just one ordinary edge to that bus, no self-loop involved.
// Invariant: src/app/selfnode.ts imports both emit and on from the shared bus for the same event; one edge to the bus is detected.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--09-self-emit-listen-pair", () => {
  const fx = {
    "src/infra/bus.ts": "export function emit(name, payload) {}\nexport function on(name, handler) {}\n",
    "src/app/selfnode.ts": "import { emit, on } from '../infra/bus.js';\nexport function tick() { on('tick', () => {}); emit('tick', {}); }\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/selfnode.ts", "src/infra/bus.ts", "import");
  } finally { cleanup(); }
});
