// Relation conformance — ported from the Yggdrasil relation e2e suites (MIT, same author).
// Case: A Go package directory whose files are owned by two different nodes silences resolution entirely (owner-set has >1 distinct owner) instead of misattributing to the lexicographically-first file's owner.
// grain adaptation: ownership is per module (directory) in grain — a one-directory Go package is never split, the edge fires.
// Invariant: One Go package directory src/pkg is split across two node owners via glob mappings: px owns src/pkg/a*.go (a_one.go), py owns src/pkg/z*.go (z_two.go). caller imports package "example.com/m/src/pkg" and declares NO relation to either. Because the package has 2 distinct owners, owner-set resolution silences the whole import: no edge attributed to px or py, check passes (exit 0). Pre-fix, pick[0] attributed the entire import to whichever node owned the lexicographically-first file, producing a false positive. Paired positive (same suite, same buildRepo helper as the standard case below): a SINGLE-owner package must still flag an undeclared edge, proving the owner-set guard does not blanket-silence all Go resolution.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("go-package-split-across-two-owners-silences-import", () => {
  const fx = {
  "go.mod": "module example.com/m\n\ngo 1.22\n",
  "src/pkg/a_one.go": "package pkg\n\nvar A = 1\n",
  "src/pkg/z_two.go": "package pkg\n\nvar Z = 2\n",
  "src/caller/use.go": "package caller\n\nimport \"example.com/m/src/pkg\"\n\nvar Use = pkg.A\n"
};
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/caller/use.go", "src/pkg/a_one.go", "import"); // Yggdrasil silenced this because ITS two declared nodes split the package; grain owns files by MODULE (directory), one dir = one owner, so the edge rightly fires
    forbidEdge(edges, "src/caller/use.go", "src/pkg/z_two.go");
  } finally { cleanup(); }
});
