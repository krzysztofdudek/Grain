// Relation conformance — ported 1:1 from Yggdrasil's cli-relations.test.ts (MIT, same author), it "6: context --node lists a node's relation targets".
// Case: `yg context --node orders/order-service` lists the node's declared relation targets (auth/auth-api via uses, users/user-repo via emits) and their relation types.
// grain adaptation: `yg context --node` is a CLI rendering command with no grain equivalent (no `context` command, no per-node relation-type labels) — the closest analog is the raw file-level edges grain's export would compute for the equivalent code-level references.
// Invariant: src/orders/order-service.ts references both src/auth/auth-api.ts and src/users/user-repo.ts; both edges are detected.
import { test } from 'node:test';
import { edgesOf, expectEdge, forbidEdge } from '../harness.mjs';

test("cli-relations--06-context-node-relation-targets", () => {
  const fx = {
    "src/auth/auth-api.ts": "export const authApi = 1;\n",
    "src/users/user-repo.ts": "export class UserRepo {}\n",
    "src/orders/order-service.ts": "import { authApi } from '../auth/auth-api.js';\nimport { UserRepo } from '../users/user-repo.js';\nexport const wiring = { authApi, UserRepo };\n"
  };
  const { edges, cleanup } = edgesOf(fx);
  try {
    expectEdge(edges, "src/orders/order-service.ts", "src/auth/auth-api.ts", "import");
    expectEdge(edges, "src/orders/order-service.ts", "src/users/user-repo.ts", "import");
  } finally { cleanup(); }
});
