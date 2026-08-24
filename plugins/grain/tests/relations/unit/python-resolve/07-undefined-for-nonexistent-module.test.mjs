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

test('returns undefined for a non-existent module (no file, no resolvable parent)', () => {
  // `nope.deep`: neither nope/deep.py, nope/deep/__init__.py, nope.py, nor
  // nope/__init__.py exists at any source root → a true resolution miss.
  expect(pyResolve.resolvePythonModule('nope.deep', 'src/a/c.py', exists)).toBeUndefined();
});
