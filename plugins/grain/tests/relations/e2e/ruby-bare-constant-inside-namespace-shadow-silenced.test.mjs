// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: A bare constant reference nested inside a module must not be resolved against a same-name top-level constant declared in another node (flat symbol table false positive).
// Invariant: b defines a UNIQUE top-level `Helper`; a uses a BARE `Helper` constant nested inside `module App` (Ruby constant lookup would normally walk lexical scope, not jump cross-node). Pre-fix the flat symbol table resolved the bare use straight to b -> false cross-node edge even with no declared relation. Under the fix, a bare-in-namespace use is suppressed -> no edge -> check --approve is green (exit 0) even WITHOUT a declared relation.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("ruby-bare-constant-inside-namespace-shadow-silenced", () => {
  const fx = {
  "src/b/helper.rb": "class Helper\n  def self.run; end\nend\n",
  "src/a/order.rb": "module App\n  class Order\n    def go\n      Helper.run\n    end\n  end\nend\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    // this case expects SILENCE — only the forbid assertions below
    forbidEdge(edges, "src/a/order.rb", "src/b/helper.rb");
  } finally { cleanup(); }
});
