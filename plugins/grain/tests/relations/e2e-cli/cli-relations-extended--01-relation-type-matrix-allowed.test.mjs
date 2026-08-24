// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "R1: all six relation types between allowed target types pass check".
// Case: all six relation types (calls/uses/extends/implements/emits/listens), each pointing at an architecture-allowed target type, pass check together.
// grain adaptation: relation "type" plus per-type target-type allow-listing are pure yg-architecture.yaml concepts; grain has a single edge kind ('import') and applies no allow-list at all.
// grain adaptation: translated to real code: a producer that calls a consumer function, extends a base class and implements an interface produces three ordinary import edges (emits/listens have no code-level signal — see the E-series below).
// Invariant: src/app/producer.ts references consumer.ts (call), base.ts (extends) and iface.ts (implements); all three are detected as import edges.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--01-relation-type-matrix-allowed", () => {
  const fx = {
    "src/app/consumer.ts": "export function doThing() {}\n",
    "src/app/base.ts": "export class Base {}\n",
    "src/app/iface.ts": "export class Iface {}\n",
    "src/app/producer.ts": "import { doThing } from './consumer.js';\nimport { Base } from './base.js';\nimport { Iface } from './iface.js';\nexport class Producer extends Base {\n  m() { doThing(); return new Iface(); }\n}\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/producer.ts", "src/app/consumer.ts", "import");
    expectEdge(edges, "src/app/producer.ts", "src/app/base.ts", "import");
    expectEdge(edges, "src/app/producer.ts", "src/app/iface.ts", "import");
  } finally { cleanup(); }
});
