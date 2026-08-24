// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "C4: outbound fan-out over the limit is a non-blocking high-fan-out warning (exit 0)".
// Case: a node whose own outbound relation count exceeds quality.max_direct_relations is a high-fan-out WARNING, not a blocking error — check still exits 0.
// grain adaptation: the warning-vs-error severity distinction and the configured threshold both have no grain equivalent — grain has no warnings system and no fan-out limit; it reports every outbound edge unconditionally and never gates the exit status on how many there are.
// Invariant: src/app/p.ts references two distinct targets (c1.ts, c2.ts); both edges are detected with no limit applied.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--19-outbound-fanout-warning", () => {
  const fx = {
    "src/app/c1.ts": "export const c1 = 1;\n",
    "src/app/c2.ts": "export const c2 = 1;\n",
    "src/app/p.ts": "import { c1 } from './c1.js';\nimport { c2 } from './c2.js';\nexport const wiring = { c1, c2 };\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/p.ts", "src/app/c1.ts", "import");
    expectEdge(edges, "src/app/p.ts", "src/app/c2.ts", "import");
  } finally { cleanup(); }
});
