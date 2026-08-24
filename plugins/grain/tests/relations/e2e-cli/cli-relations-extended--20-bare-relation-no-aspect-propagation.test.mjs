// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "C5: a bare relation does not propagate the target node's aspect to the source".
// Case: a BARE relation (no `consumes`/port) does NOT propagate the target node's aspects to the source node — the aspect stays effective on the target only.
// grain adaptation: aspects (deterministic/LLM reviewer rules, effective aspect sets, channel-6 propagation via ports) are 100% yg-model concepts with no grain equivalent whatsoever — grain has no aspect system to propagate or withhold. The only portable fragment is the bare relation itself: the plain import edge between the two files.
// Invariant: src/app/p.ts imports (bare uses) from c.ts; the edge is detected — the aspect-propagation question itself has no grain analog.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--20-bare-relation-no-aspect-propagation", () => {
  const fx = {
    "src/app/c.ts": "export const marker = 1;\n",
    "src/app/p.ts": "import { marker } from './c.js';\nexport const ref = marker;\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/p.ts", "src/app/c.ts", "import");
  } finally { cleanup(); }
});
