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

test('resolves `..pkg.mod` from src/a/b/c.py to src/a/pkg/mod.py', () => {
  expect(pyResolve.resolvePythonModule('..pkg.mod', 'src/a/b/c.py', exists)).toBe('src/a/pkg/mod.py');
});
