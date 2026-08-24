// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: Ruby's one file-precise static link, `require_relative '<literal>'`, is detected live and gates on the declared uses relation.
// Invariant: `require_relative '../b/gateway'` resolves to src/b/gateway.rb; undeclared -> refused (exit 1, mentions 'b' and 'src/a/order.rb'); declared uses: b -> check --approve passes AND a subsequent plain `yg check` stays verified — the path verdict re-validates parse-free to the SAME fingerprint the pass sealed.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("ruby-require-relative-cross-node-detected", () => {
  const fx = {
  "src/a/order.rb": "require_relative '../b/gateway'\nclass Order\n  def pay\n    Gateway.charge\n  end\nend\n",
  "src/b/gateway.rb": "class Gateway\n  def self.charge; end\nend\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/a/order.rb", "src/b/gateway.rb", "import");
  } finally { cleanup(); }
});
