// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "E1: emits with no matching listens is event-unpaired (attributed to the emitter)".
// Case: an `emits` relation with no complementary `listens` anywhere in the model is event-unpaired, attributed to the emitting node.
// grain adaptation: pairing (an emits must have a matching listens) is pure yg-model bookkeeping over declared event names — grain has no events concept, only code references. The producer's only real code-level coupling is to the shared bus module it calls `emit` on; there is no edge to the (non-listening) consumer regardless of pairing.
// Invariant: src/app/producer.ts imports emit from the shared bus and is detected as an edge to it; no edge exists to the non-listening consumer.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--06-emits-unpaired-emitter", () => {
  const fx = {
    "src/infra/bus.ts": "export function emit(name, payload) {}\nexport function on(name, handler) {}\n",
    "src/app/producer.ts": "import { emit } from '../infra/bus.js';\nexport function createOrder() { emit('order.created', {}); }\n",
    "src/app/consumer.ts": "export class Consumer {}\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/producer.ts", "src/infra/bus.ts", "import");
    forbidEdge(edges, "src/app/producer.ts", "src/app/consumer.ts");
  } finally { cleanup(); }
});
