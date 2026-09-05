import { test } from 'node:test';
import { edgesOf, expectEdge } from '../harness.mjs';
test('binds a relative import across two directories', () => {
  const fx = { 'src/a/one.ts': "import { x } from '../b/two.js';\nexport const y = x;\n", 'src/b/two.ts': 'export const x = 1;\n' };
  const { edges, cleanup } = edgesOf(fx);
  try { expectEdge(edges, 'src/a/one.ts', 'src/b/two.ts'); } finally { cleanup(); }
});
