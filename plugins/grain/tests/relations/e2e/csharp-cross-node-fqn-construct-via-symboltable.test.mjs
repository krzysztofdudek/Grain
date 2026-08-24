// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: C# has no file-level import (`using` names a namespace, not a file); the dependency edge instead comes from a fully-qualified symbol USE resolved via the shared SymbolTable.
// grain adaptation: grain's C#/Ruby symbol edges carry kind 'import' (Yggdrasil told construct/call/type-ref apart in its type gate, which grain does not port); the EDGE is the invariant here.
// Invariant: Namespaces are deliberately decoupled from directories (src/a, src/b vs MyApp.Orders, MyApp.Payments) to force resolution through the shared SymbolTable. The fully-qualified construction `new MyApp.Payments.Gateway()` resolves to an FQN and is looked up in the SymbolTable; undeclared -> refused (exit 1, mentions 'b' and 'src/a/Order.cs'); declared uses: b -> check --approve passes AND a subsequent plain `yg check` stays verified (parse-free symbol re-validation reconstructs the same fingerprint).
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("csharp-cross-node-fqn-construct-via-symboltable", () => {
  const fx = {
  "src/a/Order.cs": "namespace MyApp.Orders;\npublic class Order {\n  public void Pay() {\n    var gw = new MyApp.Payments.Gateway();\n  }\n}\n",
  "src/b/Gateway.cs": "namespace MyApp.Payments;\npublic class Gateway { }\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/a/Order.cs", "src/b/Gateway.cs", null);
  } finally { cleanup(); }
});
