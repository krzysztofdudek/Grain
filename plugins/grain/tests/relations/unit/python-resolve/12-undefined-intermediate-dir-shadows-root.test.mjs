import { test } from 'node:test';
import { expect, pyResolve } from '../_unit-harness.mjs';

test('returns undefined when an intermediate dir shadows a genuine root', () => {
  // Importing file src/pkg/a/c.py does an absolute `import pkg.mod`. The genuine
  // root is src/ -> src/pkg/mod.py. But the intermediate dir src/pkg/ also roots
  // pkg.mod -> src/pkg/pkg/mod.py. Two distinct files -> silence.
  const shadow = new Set(['src/pkg/pkg/mod.py', 'src/pkg/mod.py']);
  expect(pyResolve.resolvePythonModule('pkg.mod', 'src/pkg/a/c.py', (p) => shadow.has(p))).toBeUndefined();
});
