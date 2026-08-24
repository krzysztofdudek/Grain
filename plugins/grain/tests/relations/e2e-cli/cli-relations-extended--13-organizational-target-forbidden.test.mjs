// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "S3: a relation to an organizational module target is forbidden when the architecture omits it".
// Case: the same organizational parent-module target is FORBIDDEN for a relation type whose allow-list omits `module` (e.g. `calls`), yielding relation-target-forbidden.
// grain adaptation: the allow-list gate has no grain equivalent — grain collapses S2 and S3 onto the identical underlying detection. The nested file's reference to its parent's barrel file is an ordinary cross-module import either way; grain applies no forbidding.
// Invariant: src/app/p/service.ts calls a function exported from the parent module's ../index.js; the edge is detected with no forbidding.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--13-organizational-target-forbidden", () => {
  const fx = {
    "src/app/index.ts": "export function rootFn() { return 1; }\n",
    "src/app/p/service.ts": "import { rootFn } from '../index.js';\nexport function run() { return rootFn(); }\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/p/service.ts", "src/app/index.ts", "import");
  } finally { cleanup(); }
});
