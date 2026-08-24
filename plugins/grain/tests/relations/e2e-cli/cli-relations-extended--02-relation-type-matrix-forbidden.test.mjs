// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "R2: forbidden calls/uses/extends/implements targets each yield relation-target-forbidden".
// Case: each of calls/uses/extends/implements pointed at an architecture-disallowed target type collapses into one relation-target-forbidden group naming all four offending pairs.
// grain adaptation: relation-target-forbidden is entirely architecture-gating (yg-architecture.yaml's per-type allowed-targets list); grain has no such gate. Every one of these references is still an ordinary resolvable import in source terms, and grain detects it regardless of any 'allowed target type'.
// Invariant: src/app/producer.ts references both base.ts and iface.ts by ordinary import; both edges are detected with no forbidding applied.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--02-relation-type-matrix-forbidden", () => {
  const fx = {
    "src/app/base.ts": "export function baseFn() {}\n",
    "src/app/iface.ts": "export const Iface = 1;\n",
    "src/app/producer.ts": "import { baseFn } from './base.js';\nimport { Iface } from './iface.js';\nexport function run(x) { baseFn(); return Iface; }\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/producer.ts", "src/app/base.ts", "import");
    expectEdge(edges, "src/app/producer.ts", "src/app/iface.ts", "import");
  } finally { cleanup(); }
});
