import { test } from 'node:test';
import { expect, pyResolve } from '../_unit-harness.mjs';

// `exists` predicate over a fixed set of repo-relative POSIX files.
const known = new Set([
  'src/a/b.py',
  'src/a/__init__.py',
  'src/a/pkg/mod.py',
  'src/a/sib.py',
  'src/pkg/__init__.py',
  'top.py',
]);
const exists = (p) => known.has(p);

test('returns undefined for a stdlib/third-party module (no mapped file)', () => {
  expect(pyResolve.resolvePythonModule('os', 'src/a/c.py', exists)).toBeUndefined();
  expect(pyResolve.resolvePythonModule('requests', 'src/a/c.py', exists)).toBeUndefined();
});
