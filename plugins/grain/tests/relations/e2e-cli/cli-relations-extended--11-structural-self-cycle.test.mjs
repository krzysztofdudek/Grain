// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "S1: a structural self-relation (uses itself) yields structural-cycle app/p -> app/p".
// Case: a node that structurally `uses` itself is reported as a single-node structural-cycle app/p -> app/p, distinct from a two-node cycle.
// grain adaptation: grain cannot represent a single-file/single-module self-loop at all. Confirmed empirically: a file that imports itself, or two files that reference each other only WITHIN the same module (directory), produce ZERO file-level edges and ZERO moduleGraph edges/cycles — intra-module references are never tracked as edges in the first place. The only truthful pin is silence: a self-referencing file produces no self-edge and the module graph reports no cycle.
// Invariant: src/app/p.ts imports from its own path; no self-edge is reported and the moduleGraph carries no cycle.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--11-structural-self-cycle", () => {
  const fx = {
    "src/app/p.ts": "import { helper } from './p.js';\nexport function helper() { return 1; }\nexport function run() { return helper(); }\n"
  };
  const { edges, moduleGraph, cleanup } = edgesOf(fx);
  try {
    // this case expects SILENCE — grain never emits a self-edge for a file referencing itself
    forbidEdge(edges, "src/app/p.ts", "src/app/p.ts");
    if (moduleGraph.cycles.length !== 0) {
      throw new Error("expected no module-level cycle, got: " + JSON.stringify(moduleGraph.cycles));
    }
  } finally { cleanup(); }
});
