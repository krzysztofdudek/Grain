// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "R4: an unconstrained relation type (omitted from the type config) is allowed to any target".
// Case: when the architecture omits a relation type from a node type's constrained list, that type is UNCONSTRAINED — allowed to any target — and check passes.
// grain adaptation: grain never gates any edge by a source/target 'type' pairing (there is no type concept at all), so every reference is unconditionally 'unconstrained' in grain terms. This makes the scenario trivially true, but it is still ported 1:1.
// Invariant: src/app/consumer.ts imports from base.ts; the edge is detected with no gating of any kind.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--04-unconstrained-relation-type", () => {
  const fx = {
    "src/app/base.ts": "export function baseFn() {}\n",
    "src/app/consumer.ts": "import { baseFn } from './base.js';\nexport function run() { baseFn(); }\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/consumer.ts", "src/app/base.ts", "import");
  } finally { cleanup(); }
});
