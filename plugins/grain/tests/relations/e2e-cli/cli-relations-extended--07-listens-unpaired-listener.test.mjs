// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "E2: listens with no matching emits is event-unpaired (attributed to the listener)".
// Case: the reverse direction — a `listens` relation with no complementary `emits` anywhere is event-unpaired, attributed to the listening node.
// grain adaptation: same as E1, reversed: pairing has no grain equivalent. The listener's only real code-level coupling is to the shared bus it calls `on` against; no edge exists to the (non-emitting) producer.
// Invariant: src/app/consumer.ts imports on from the shared bus and is detected as an edge to it; no edge exists to the non-emitting producer.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--07-listens-unpaired-listener", () => {
  const fx = {
    "src/infra/bus.ts": "export function emit(name, payload) {}\nexport function on(name, handler) {}\n",
    "src/app/consumer.ts": "import { on } from '../infra/bus.js';\nexport function subscribe() { on('e1', () => {}); }\n",
    "src/app/producer.ts": "export class Producer {}\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/consumer.ts", "src/infra/bus.ts", "import");
    forbidEdge(edges, "src/app/consumer.ts", "src/app/producer.ts");
  } finally { cleanup(); }
});
