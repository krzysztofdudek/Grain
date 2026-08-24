// Relation conformance — ported 1:1 from Yggdrasil's cli-relations-extended.test.ts (MIT, same author), it "E3: multiple correctly paired emits/listens relations all pass".
// Case: two independent producer/consumer pairs, each with a correctly complemented emits/listens relation, both pass check.
// grain adaptation: pairing has no grain equivalent. Each producer/consumer pair is only code-coupled to the shared bus module, never to each other directly — this holds independent of how many pairs exist.
// Invariant: producer1/consumer1 and producer2/consumer2 each import the shared bus; neither pair has a direct edge to its counterpart.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations-extended--08-multi-pair-emits-listens", () => {
  const fx = {
    "src/infra/bus.ts": "export function emit(name, payload) {}\nexport function on(name, handler) {}\n",
    "src/app/producer1.ts": "import { emit } from '../infra/bus.js';\nexport function fire1() { emit('e1', {}); }\n",
    "src/app/consumer1.ts": "import { on } from '../infra/bus.js';\nexport function listen1() { on('e1', () => {}); }\n",
    "src/app/producer2.ts": "import { emit } from '../infra/bus.js';\nexport function fire2() { emit('e2', {}); }\n",
    "src/app/consumer2.ts": "import { on } from '../infra/bus.js';\nexport function listen2() { on('e2', () => {}); }\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/app/producer1.ts", "src/infra/bus.ts", "import");
    expectEdge(edges, "src/app/consumer1.ts", "src/infra/bus.ts", "import");
    expectEdge(edges, "src/app/producer2.ts", "src/infra/bus.ts", "import");
    expectEdge(edges, "src/app/consumer2.ts", "src/infra/bus.ts", "import");
    forbidEdge(edges, "src/app/producer1.ts", "src/app/consumer1.ts");
    forbidEdge(edges, "src/app/producer2.ts", "src/app/consumer2.ts");
  } finally { cleanup(); }
});
