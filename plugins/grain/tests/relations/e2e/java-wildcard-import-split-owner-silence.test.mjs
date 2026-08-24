// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: A wildcard import `com.b.*` whose target package directory is split across two node owners (each owning one distinct file) resolves to no single owner and is silenced.
// grain adaptation: ownership is per module (directory) in grain — a one-directory Java package is never split, the edge fires.
// Invariant: The com.b package directory's two files are owned by two different nodes (b1 maps only Bar.java, b2 maps only Baz.java). The wildcard import `import com.b.*;` resolves to a SPLIT owner set -> no attribution -> no violation (exit 0), even though a declares no relation to either. Trades recall for zero false positives.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("java-wildcard-import-split-owner-silence", () => {
  const fx = {
  "src/main/java/com/a/Foo.java": "package com.a;\nimport com.b.*;\npublic class Foo {\n  Bar bar;\n  Baz baz;\n}\n",
  "src/main/java/com/b/Bar.java": "package com.b;\npublic class Bar {}\n",
  "src/main/java/com/b/Baz.java": "package com.b;\npublic class Baz {}\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/main/java/com/a/Foo.java", "src/main/java/com/b/Bar.java", "import"); // Yggdrasil split this package across two of ITS nodes; grain owns files by MODULE (directory), one dir = one owner, so the edge rightly fires
    forbidEdge(edges, "src/main/java/com/a/Foo.java", "src/main/java/com/b/Baz.java");
  } finally { cleanup(); }
});
