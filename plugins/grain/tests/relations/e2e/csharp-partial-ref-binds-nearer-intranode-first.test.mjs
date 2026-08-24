// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: A partially-qualified type use inside a `using` directive must bind the NEARER intra-node candidate in an ordered walk and stop, never reaching a same-name foreign top-level type.
// Invariant: n1 contains BOTH the consumer (Order.cs: `using App.Data; ... new Models.Order()`) and the NEARER binding (Data.cs: `namespace App.Data; class Models { class Order {} }` -> key App.Data.Models+Order, since `using App.Data;` imports the TYPE Models and Order is nested in it, never a sub-namespace). n2 has an unrelated top-level `namespace Models; class Order {}` (key Models.Order). For the ordered candidate group [App.Services.Models.Order, App.Models.Order, App.Data.Models.Order, Models.Order], the walk binds the using-relative App.Data.Models.Order FIRST — intra-node n1, exempt — and STOPS; the verbatim Models.Order (which would resolve to n2) is never reached. No n1->n2 edge; n1 declares no relation to n2; check --approve passes (exit 0). Guards against a pre-Stage-2 bug where an independent verbatim hint resolved straight to n2 and false-flagged.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("csharp-partial-ref-binds-nearer-intranode-first", () => {
  const fx = {
  "src/n1/Order.cs": "namespace App.Services;\nusing App.Data;\npublic class C { void M() { var o = new Models.Order(); } }\n",
  "src/n1/Data.cs": "namespace App.Data;\npublic class Models { public class Order { } }\n",
  "src/n2/Order.cs": "namespace Models;\npublic class Order { }\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    // this case expects SILENCE — only the forbid assertions below
    forbidEdge(edges, "src/n1/Order.cs", "src/n2/Order.cs");
  } finally { cleanup(); }
});
