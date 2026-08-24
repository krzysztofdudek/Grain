// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "S2: a relation to an organizational module target is allowed when the architecture permits it".
// Case: a `uses` relation from a nested node to its ORGANIZATIONAL parent module target is ALLOWED when the architecture's allow-list for that type includes `module`.
// grain adaptation: the allow-list gate has no grain equivalent (see R2). The nested file importing from its parent directory's barrel file is an ordinary cross-module import, detected the same way regardless of any 'organizational target' status.
// Invariant: src/app/p/service.ts imports from the parent module's ../index.js; the edge is detected.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--12-organizational-target-allowed", () => {
  const fx = {
    "src/app/index.ts": "export const marker = 1;\n",
    "src/app/p/service.ts": "import { marker } from '../index.js';\nexport const ref = marker;\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/p/service.ts", "src/app/index.ts", "import");
  } finally { cleanup(); }
});
