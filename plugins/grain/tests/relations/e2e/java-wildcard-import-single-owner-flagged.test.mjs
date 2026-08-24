// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: The same wildcard import fires an edge when the target package directory has exactly one owning node.
// grain adaptation: a wildcard import into a single-module package resolves to one representative file of that package.
// Invariant: com.b directory is wholly owned by a single node b (one mapping covering the whole dir) -> the wildcard resolves to a single owner -> undeclared cross-node edge -> refused (exit 1, mentions 'src/main/java/com/a/Foo.java'). Confirms the split-owner guard above does not blanket-silence wildcard resolution.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("java-wildcard-import-single-owner-flagged", () => {
  const fx = {
  "src/main/java/com/a/Foo.java": "package com.a;\nimport com.b.*;\npublic class Foo {\n  Bar bar;\n  Baz baz;\n}\n",
  "src/main/java/com/b/Bar.java": "package com.b;\npublic class Bar {}\n",
  "src/main/java/com/b/Baz.java": "package com.b;\npublic class Baz {}\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/main/java/com/a/Foo.java", "src/main/java/com/b/Bar.java", "import");
    expectEdge(edges, "src/main/java/com/a/Foo.java", "src/main/java/com/b/Bar.java", "import"); // the wildcard lands on the package's first live file (deterministic pick), Bar before Baz
  } finally { cleanup(); }
});
