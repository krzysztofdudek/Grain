import { test } from 'node:test';
import { expect, javaResolve } from '../_unit-harness.mjs';

test('resolves from a file at the repo root (dirname is "." → root ancestor)', () => {
  // A fromFile with no directory yields dirname '.', which ancestorDirs maps to the
  // repo root ''. The type FQN resolves against a file directly under the root.
  const rootFiles = new Set(['com/foo/Bar.java']);
  const rootDeps = {
    exists: (p) => rootFiles.has(p),
    javaFilesIn: () => [],
  };
  expect(javaResolve.resolveJavaFqn('com.foo.Bar', 'Main.java', rootDeps)).toBe('com/foo/Bar.java');
});
