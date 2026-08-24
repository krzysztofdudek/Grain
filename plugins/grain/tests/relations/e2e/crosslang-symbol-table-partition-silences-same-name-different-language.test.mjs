// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: The symbol table is partitioned BY LANGUAGE: a bare type name declared in one language must never satisfy a same-name symbol use in another language.
// Invariant: A C++ node declares `class Connection`; an unrelated Ruby node subclasses a bare `Connection` (a superclass symbol hint) with NO declared relation between the nodes. Historical FP: both were keyed as bare "Connection" in one shared symbol table, so the Ruby use wrongly resolved onto the C++ class. After the language-partition fix, this is SILENT (exit 0, no violation) — the two 'Connection' declarations are never unified across languages.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("crosslang-symbol-table-partition-silences-same-name-different-language", () => {
  const fx = {
  "src/cppnet/connection.cpp": "class Connection {\npublic:\n  void open();\n};\n",
  "src/rubyapp/session.rb": "class Session < Connection\n  def start; end\nend\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    // this case expects SILENCE — only the forbid assertions below
    forbidEdge(edges, "src/rubyapp/session.rb", "src/cppnet/connection.cpp");
  } finally { cleanup(); }
});
