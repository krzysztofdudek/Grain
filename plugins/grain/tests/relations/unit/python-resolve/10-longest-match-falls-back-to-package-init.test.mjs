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

test('longest-match: `a.nope` falls back to package `a` __init__ (nope may be a symbol there)', () => {
  // Documented behaviour: `from a import nope` where `nope` is not a submodule
  // file resolves to the package a (src/a/__init__.py); the symbol lives inside.
  expect(pyResolve.resolvePythonModule('a.nope', 'src/a/c.py', exists)).toBe('src/a/__init__.py');
});
