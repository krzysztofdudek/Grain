// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "C3: a target with many inbound relations has a blast radius equal to the inbound count".
// Case: a single target with many inbound relations has an impact blast radius equal to the number of distinct inbound dependents.
// grain adaptation: the blast-radius rollup has no grain equivalent (see C2). The portable invariant is the raw inbound edge count: five distinct producer files each referencing the same target all show up as five distinct edges.
// Invariant: p1.ts .. p5.ts each import c.ts; all five edges into c.ts are detected.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--18-impact-inbound-fanout", () => {
  const fx = {
    "src/app/c.ts": "export const shared = 1;\n",
    "src/app/p1.ts": "import { shared } from './c.js';\nexport const p1 = shared;\n",
    "src/app/p2.ts": "import { shared } from './c.js';\nexport const p2 = shared;\n",
    "src/app/p3.ts": "import { shared } from './c.js';\nexport const p3 = shared;\n",
    "src/app/p4.ts": "import { shared } from './c.js';\nexport const p4 = shared;\n",
    "src/app/p5.ts": "import { shared } from './c.js';\nexport const p5 = shared;\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/p1.ts", "src/app/c.ts", "import");
    expectEdge(edges, "src/app/p2.ts", "src/app/c.ts", "import");
    expectEdge(edges, "src/app/p3.ts", "src/app/c.ts", "import");
    expectEdge(edges, "src/app/p4.ts", "src/app/c.ts", "import");
    expectEdge(edges, "src/app/p5.ts", "src/app/c.ts", "import");
  } finally { cleanup(); }
});
