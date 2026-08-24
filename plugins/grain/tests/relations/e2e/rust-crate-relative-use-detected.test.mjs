// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: A crate-relative `use crate::b::Bar;` resolved through the module tree declared in lib.rs is detected live and gates on the declared uses relation.
// Invariant: Cargo.toml supplies the crate name/module root; `pub mod a; pub mod b;` in src/lib.rs declares the top-level module tree, so `use crate::b::Bar;` resolves to src/b.rs; undeclared -> refused (exit 1, mentions 'b' and 'src/a.rs'); declared uses: b -> passes.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("rust-crate-relative-use-detected", () => {
  const fx = {
  "Cargo.toml": "[package]\nname = \"mycrate\"\nversion = \"0.1.0\"\nedition = \"2021\"\n",
  "src/lib.rs": "pub mod a;\npub mod b;\n",
  "src/a.rs": "use crate::b::Bar;\npub fn foo() -> u32 { Bar }\n",
  "src/b.rs": "pub const Bar: u32 = 1;\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/a.rs", "src/b.rs", "import");
  } finally { cleanup(); }
});
