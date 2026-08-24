// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: Positive control paired with the cross-language silence case: a same-language (Ruby->Ruby) cross-node require_relative dependency must still be detected — the language partition must not blanket-silence detection.
// Invariant: Two Ruby nodes (same language): rubyapp/session.rb require_relatives rubylib/connection.rb across the node boundary with NO declared relation. This same-language path edge MUST still flag (exit 1, mentions 'src/rubyapp/session.rb' and 'rubylib') — proves the by-language symbol-table partition did not blanket-silence same-language detection generally, only the cross-language false positive.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("crosslang-samelang-require-relative-still-flagged", () => {
  const fx = {
  "src/rubylib/connection.rb": "class Connection\n  def open; end\nend\n",
  "src/rubyapp/session.rb": "require_relative '../rubylib/connection'\nclass Session < Connection\n  def start; end\nend\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/rubyapp/session.rb", "src/rubylib/connection.rb", "import");
  } finally { cleanup(); }
});
