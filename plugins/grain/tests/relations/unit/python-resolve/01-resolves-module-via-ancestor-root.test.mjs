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

test('resolves a module file via an ancestor source root', () => {
  // Importing from src/a/c.py, module `a.b` lives at src/a/b.py (root = src/).
  expect(pyResolve.resolvePythonModule('a.b', 'src/a/c.py', exists)).toBe('src/a/b.py');
});
