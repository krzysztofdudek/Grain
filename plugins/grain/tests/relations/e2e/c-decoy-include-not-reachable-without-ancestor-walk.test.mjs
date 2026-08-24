// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: A quoted include with no sibling file of that name must resolve to nothing (not silently walk up to a same-basename header owned by another node) once the ancestor include-root walk is removed.
// Invariant: a/foo.c quote-includes "cfg.h" with NO src/a/cfg.h sibling; the only cfg.h anywhere is in node b (src/b/cfg.h), reachable only via a now-dropped ancestor include-root walk. With the walk removed, the canonical relative-join resolution misses entirely -> no cross-node edge -> no violation, even though a declares no relation to b (exit 0 / no relation-undeclared-dependency). Old behavior: the walk grabbed src/b/cfg.h and falsely flagged an undeclared a->b dependency.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("c-decoy-include-not-reachable-without-ancestor-walk", () => {
  const fx = {
  "src/a/foo.c": "#include \"cfg.h\"\nint foo(void) { return 0; }\n",
  "src/b/cfg.h": "#pragma once\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    // this case expects SILENCE — only the forbid assertions below
    forbidEdge(edges, "src/a/foo.c", "src/b/cfg.h");
  } finally { cleanup(); }
});
