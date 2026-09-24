// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: A bare constant nested inside a module binds through Ruby's lexical lookup (Module.nesting) before the top level, so a nearer namespaced constant shadows a same-name top-level constant in another directory.
// Invariant: b defines a top-level `Helper`; a defines `App::Helper` and uses a BARE `Helper` inside `module App; class Order`. Ruby finds App::Helper first, so the use binds inside a — never to b's top-level Helper → no edge from order.rb to b. (Updated with Yggdrasil 6.1.0: without the nearer App::Helper, the bare use IS Ruby's top-level Helper and is an edge — see the reference catalogue's ruby-bare-constant-in-method-edge.)
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("ruby-bare-constant-inside-namespace-shadow-silenced", () => {
  const fx = {
  "src/b/helper.rb": "class Helper\n  def self.run; end\nend\n",
  "src/a/app_helper.rb": "module App\n  class Helper\n  end\nend\n",
  "src/a/order.rb": "module App\n  class Order\n    def go\n      Helper.run\n    end\n  end\nend\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    forbidEdge(edges, "src/a/order.rb", "src/b/helper.rb");
  } finally { cleanup(); }
});
