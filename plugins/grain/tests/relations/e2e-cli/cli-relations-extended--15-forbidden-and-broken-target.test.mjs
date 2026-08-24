// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "B2: a forbidden-type relation to a missing target reports only relation-broken".
// Case: a relation that is BOTH a forbidden-type and points at a nonexistent target reports only relation-broken — relation-target-forbidden requires the target to exist (it reads the target's type), so a missing target short-circuits the forbidden check.
// grain adaptation: with no forbidden-type gate to short-circuit in the first place, this collapses onto the same 'unresolvable reference stays silent' invariant already pinned in B1 — reasserted here on a minimal single-import fixture for 1:1 fidelity with the source suite.
// Invariant: src/app/p.ts imports from a nonexistent module; no edge is reported.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--15-forbidden-and-broken-target", () => {
  const fx = {
    "src/app/p.ts": "import { ghost } from './ghost.js';\nexport const y = ghost;\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    // this case expects SILENCE — only the forbid assertion below
    forbidEdge(edges, "src/app/p.ts", "src/app/ghost.ts");
  } finally { cleanup(); }
});
