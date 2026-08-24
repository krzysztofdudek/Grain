// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "R3: a forbidden emits target yields relation-target-forbidden (and event-unpaired)".
// Case: an `emits` relation pointed at an architecture-disallowed target type yields relation-target-forbidden, and — since the complementary listens is also absent — event-unpaired fires too.
// grain adaptation: target-type forbidding has no grain equivalent (see R2). The `emits` role itself is pure YAML pub/sub metadata with no code-level signal (see the E-series) — the only portable code-level coupling is a producer importing the type of the payload it constructs for the event, which is an ordinary import regardless of any forbidden-target or pairing semantics.
// Invariant: src/app/producer.ts imports BadEvent from base.ts to construct its event payload; the edge is detected.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--03-forbidden-emits-target", () => {
  const fx = {
    "src/app/base.ts": "export class BadEvent {}\n",
    "src/app/producer.ts": "import { BadEvent } from './base.js';\nexport function emitBad() { return new BadEvent(); }\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/producer.ts", "src/app/base.ts", "import");
  } finally { cleanup(); }
});
