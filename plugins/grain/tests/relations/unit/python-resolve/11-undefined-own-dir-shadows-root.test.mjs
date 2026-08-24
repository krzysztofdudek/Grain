import { test } from 'node:test';
import { expect, pyResolve } from '../_unit-harness.mjs';

test('returns undefined when the own dir shadows a genuine root (2+ distinct files)', () => {
  // Importing file src/a/b.py does `from b.bar import x`. The genuine root is
  // src/, where b.bar -> src/b/bar.py (a real cross-node target). But the
  // importer's OWN dir src/a/ also "roots" the parent module b -> src/a/b.py
  // (the importing file itself). Two distinct files match across roots, so the
  // absolute resolver must SILENCE (undefined) rather than pick the nearer self.
  const shadow = new Set(['src/a/b.py', 'src/b/bar.py']);
  expect(pyResolve.resolvePythonModule('b.bar', 'src/a/b.py', (p) => shadow.has(p))).toBeUndefined();
});
