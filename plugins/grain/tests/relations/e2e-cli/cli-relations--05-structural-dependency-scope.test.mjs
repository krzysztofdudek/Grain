// Relation conformance — ported 1:1 from Yggdrasil's cli-relations.test.ts (MIT, same author), it "5: structural dependency scope — a source edit leaves only the dependency unverified; a dependency metadata reword does not invalidate the dependent".
// Case: under the verdict-lock model, editing a dependency's source leaves only the dependency's own verdicts unverified (the dependent is untouched apart from its live relation check); rewording the dependency's yg-node.yaml description does not cascade onto the dependent at all.
// grain adaptation: this is almost entirely about Yggdrasil's verdict-lock / approve-baseline caching model (unverified pairs, PASS wording, cascade scoping) — grain has no lock, no approve step and no verdict cache; every `export` recomputes edges live from current source, so there is nothing to invalidate or leave stale.
// grain adaptation: the only portable invariant is that the dependency edge (orders.ts -> payments.ts) is detected consistently across a dependency source edit and a dependency comment-only (\"metadata\") edit — live recomputation is stable, with no cache to go stale in either direction.
// Invariant: orders.ts -> payments.ts is detected before any edit, after payments.ts gains a new export, and after payments.ts gains only a leading comment — the edge is unaffected by any of them.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations--05-structural-dependency-scope", () => {
  const base = {
    "src/services/payments.ts": "export function charge(id) { return id; }\n",
    "src/services/orders.ts": "import { charge } from './payments.js';\nexport function createOrder(id) { return charge(id); }\n"
  };

  const r1 = edgesOf(base);
  try {
    expectEdge(r1.edges, "src/services/orders.ts", "src/services/payments.ts", "import");
  } finally { r1.cleanup(); }

  // (a) dependency SOURCE edit — appends a function; grain recomputes live, edge unaffected.
  const afterSourceEdit = {
    ...base,
    "src/services/payments.ts": base["src/services/payments.ts"] + "\nexport function describePayment(id) { return String(id); }\n"
  };
  const r2 = edgesOf(afterSourceEdit);
  try {
    expectEdge(r2.edges, "src/services/orders.ts", "src/services/payments.ts", "import");
  } finally { r2.cleanup(); }

  // (b) dependency METADATA-only reword — grain has no yg-node.yaml description field, so the
  // closest analog is a comment-only edit to the dependency source; still no effect on the edge.
  const afterMetaEdit = {
    ...base,
    "src/services/payments.ts": "// Charges and refunds payments for orders (updated wording).\n" + base["src/services/payments.ts"]
  };
  const r3 = edgesOf(afterMetaEdit);
  try {
    expectEdge(r3.edges, "src/services/orders.ts", "src/services/payments.ts", "import");
  } finally { r3.cleanup(); }
});
