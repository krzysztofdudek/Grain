// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: An in-module Go package import resolved via go.mod's module path is detected live and gates on the declared uses relation.
// Invariant: `import "example.com/m/src/b"` resolves via the root go.mod module path (example.com/m) to the single-owner package src/b; undeclared -> refused (exit 1, mentions 'b' and 'src/a/foo.go'); declared uses: b -> passes.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("go-cross-node-import-detected", () => {
  const fx = {
  "go.mod": "module example.com/m\n\ngo 1.22\n",
  "src/a/foo.go": "package a\n\nimport \"example.com/m/src/b\"\n\nvar Foo = b.X\n",
  "src/b/bar.go": "package b\n\nvar X = 1\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/a/foo.go", "src/b/bar.go", "import");
  } finally { cleanup(); }
});
