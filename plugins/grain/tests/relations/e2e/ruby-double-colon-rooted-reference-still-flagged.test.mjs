// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: Companion positive: rewriting the same bare reference as a `::`-rooted absolute top-level reference is NOT suppressed and must still be flagged as a cross-node edge.
// grain adaptation: grain's C#/Ruby symbol edges carry kind 'import' (Yggdrasil told construct/call/type-ref apart in its type gate, which grain does not port); the EDGE is the invariant here.
// Invariant: Same fixture as the bare-constant guard case above, but src/a/order.rb is rewritten to use `::Helper.run` — a complete, unambiguous top-level-rooted reference. This is NOT suppressed by the namespace guard: the undeclared cross-node edge flags (exit 1, mentions 'src/a/order.rb'), proving the guard targets only ambiguous bare lookups, not explicit top-level references.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("ruby-double-colon-rooted-reference-still-flagged", () => {
  const fx = {
  "src/b/helper.rb": "class Helper\n  def self.run; end\nend\n",
  "src/a/order.rb": "module App\n  class Order\n    def go\n      ::Helper.run\n    end\n  end\nend\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/a/order.rb", "src/b/helper.rb", null);
  } finally { cleanup(); }
});
