// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: A quoted relative `#include "../b/bar.h"` resolved relative to the including file's directory is detected live and gates on the declared uses relation.
// Invariant: `#include "../b/bar.h"` resolves relative to src/a -> src/b/bar.h; undeclared -> refused (exit 1, mentions 'b' and 'src/a/foo.c'); declared uses: b -> passes.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("c-quoted-relative-include-detected", () => {
  const fx = {
  "src/a/foo.c": "#include \"../b/bar.h\"\nint foo(void) { return bar(); }\n",
  "src/b/bar.h": "#pragma once\nint bar(void);\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/a/foo.c", "src/b/bar.h", "import");
  } finally { cleanup(); }
});
