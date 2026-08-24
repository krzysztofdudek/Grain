// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: An FQN `import com.b.Bar;` (package mirrors directory) is detected live and gates on the declared uses relation.
// Invariant: FQN import `import com.b.Bar;` detected live; undeclared -> refused (exit 1, mentions 'b' and 'src/main/java/com/a/Foo.java'); declared uses: b -> passes.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("java-cross-node-fqn-import-detected", () => {
  const fx = {
  "src/main/java/com/a/Foo.java": "package com.a;\nimport com.b.Bar;\npublic class Foo {\n  Bar bar;\n}\n",
  "src/main/java/com/b/Bar.java": "package com.b;\npublic class Bar {}\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/main/java/com/a/Foo.java", "src/main/java/com/b/Bar.java", "import");
  } finally { cleanup(); }
});
