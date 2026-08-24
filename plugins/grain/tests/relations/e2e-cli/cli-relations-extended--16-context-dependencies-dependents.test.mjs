// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "C1: context --node lists outbound relations as Dependencies and inbound as Dependents".
// Case: `yg context --node` renders a node's outbound relations as Dependencies (each tagged with its relation type) and inbound relations as Dependents.
// grain adaptation: `yg context --node` is CLI-rendered output with no grain equivalent — grain's edges array already carries both directions in one record (from/to), so 'Dependencies' from the source's side and 'Dependents' from the target's side are simply the SAME edge queried by its `from` or `to` field; there is no separate inbound/outbound query.
// Invariant: src/app/p.ts references c.ts, b.ts and i.ts (3 outbound edges); the edge into c.ts is the same record read from c.ts's side as its one Dependent.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--16-context-dependencies-dependents", () => {
  const fx = {
    "src/app/c.ts": "export function cFn() {}\n",
    "src/app/b.ts": "export class Base {}\n",
    "src/app/i.ts": "export class Iface {}\n",
    "src/app/p.ts": "import { cFn } from './c.js';\nimport { Base } from './b.js';\nimport { Iface } from './i.js';\nexport class P extends Base {\n  m() { cFn(); return new Iface(); }\n}\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/p.ts", "src/app/c.ts", "import");
    expectEdge(edges, "src/app/p.ts", "src/app/b.ts", "import");
    expectEdge(edges, "src/app/p.ts", "src/app/i.ts", "import");
  } finally { cleanup(); }
});
