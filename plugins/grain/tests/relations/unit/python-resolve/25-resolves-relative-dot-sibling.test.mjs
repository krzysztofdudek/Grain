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

test('resolves `.sib` (one dot, same package) from src/a/x.py to src/a/sib.py', () => {
  expect(pyResolve.resolvePythonModule('.sib', 'src/a/x.py', exists)).toBe('src/a/sib.py');
});
