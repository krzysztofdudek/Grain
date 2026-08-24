// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: A fully-qualified use of a nested type (`Outer.Inner`) resolves via a `+`-split against the declared outer type, detecting the cross-node edge that a simple-name key would miss.
// grain adaptation: grain's C#/Ruby symbol edges carry kind 'import' (Yggdrasil told construct/call/type-ref apart in its type gate, which grain does not port); the EDGE is the invariant here.
// Invariant: n2 declares a NESTED type (`namespace App; class Outer { class Inner {} }` -> key App.Outer+Inner). n1 constructs `new App.Outer.Inner()` fully-qualified. The resolver splits the dotted use at the declared type App.Outer -> App.Outer+Inner -> n2. Undeclared -> refused (exit 1, mentions 'n2' and 'src/n1/Use.cs'); declared uses: n2 -> passes. Pre-Stage-2 this silently missed because the declaration side keyed only the simple name App.Inner.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("csharp-nested-type-dotted-use-resolves-via-guarded-split", () => {
  const fx = {
  "src/n1/Use.cs": "namespace Other;\npublic class C { void M() { var x = new App.Outer.Inner(); } }\n",
  "src/n2/Nested.cs": "namespace App;\npublic class Outer { public class Inner { } }\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/n1/Use.cs", "src/n2/Nested.cs", null);
  } finally { cleanup(); }
});
