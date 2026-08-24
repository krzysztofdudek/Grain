// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "R5: an unknown relation type is rejected as a yaml-invalid parse error".
// Case: declaring an unrecognized relation `type` (e.g. `invokes`) in yg-node.yaml is rejected at parse time as yaml-invalid, naming the offending `relations[i].type`.
// grain adaptation: this is 100% yg-node.yaml YAML-schema validation (the relations[].type enum) — grain has no yg-node.yaml file and no relation "type" field at all, so there is no direct analog. This file pins the nearest degenerate baseline instead: that grain correctly extracts a plain, valid cross-file reference without erroring, standing in for "parsing succeeds" since grain has no relation schema to violate in the first place.
// Invariant: src/app/c.ts imports from root.ts; the edge is detected and export exits cleanly (no schema to violate).
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--05-unknown-relation-type-invalid", () => {
  const fx = {
    "src/app/root.ts": "export const x = 1;\n",
    "src/app/c.ts": "import { x } from './root.js';\nexport const y = x;\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/c.ts", "src/app/root.ts", "import");
  } finally { cleanup(); }
});
