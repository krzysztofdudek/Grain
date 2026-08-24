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

test('longest-match: `a.b.thing` falls back to the parent module a.b', () => {
  // No src/a/b/thing.py; the parent module a.b (src/a/b.py) is the owning file.
  expect(pyResolve.resolvePythonModule('a.b.thing', 'src/a/c.py', exists)).toBe('src/a/b.py');
});
