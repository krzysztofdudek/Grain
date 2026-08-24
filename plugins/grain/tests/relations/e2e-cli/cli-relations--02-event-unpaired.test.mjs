// Relation conformance — ported 1:1 from Yggdrasil's cli-relations.test.ts (MIT, same author), it "2: event-unpaired — removing the listens half of an emits/listens pair fails check".
// Case: removing the listens half of a declared emits/listens event pair fails check with event-unpaired, attributed to the emitter node.
// grain adaptation: emits/listens pairing is pure YAML-declared pub/sub metadata pairing two nodes by event name; grain has no events concept and reads only source-level references.
// grain adaptation: in the source fixture the emitter and listener are coupled ONLY through the declared event — no import exists between them either way. The portable invariant is that grain, having no signal for decoupled event communication, reports no edge between the two files in either direction, regardless of pairing.
// Invariant: src/orders/order-service.ts and src/users/user-repo.ts have no import between them (an event pairing, paired or not, leaves no code trace); no edge is reported in either direction.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations--02-event-unpaired", () => {
  const fx = {
    "src/orders/order-service.ts": "export function createOrder() {\n  // emits order.created over an out-of-band bus; no direct reference to a listener\n}\n",
    "src/users/user-repo.ts": "export class UserRepo {}\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    // this case expects SILENCE — only the forbid assertions below
    forbidEdge(edges, "src/orders/order-service.ts", "src/users/user-repo.ts");
    forbidEdge(edges, "src/users/user-repo.ts", "src/orders/order-service.ts");
  } finally { cleanup(); }
});
