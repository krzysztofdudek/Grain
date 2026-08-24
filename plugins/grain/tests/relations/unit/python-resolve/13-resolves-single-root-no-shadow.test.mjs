import { test } from 'node:test';
import { expect, pyResolve } from '../_unit-harness.mjs';

test('still resolves a single-root cross-node import (no shadowing file present)', () => {
  // Paired positive: ONLY the genuine target exists (no self-shadow). The legit
  // cross-node edge `from b.bar import x` at the source root must still resolve.
  const clean = new Set(['src/b/bar.py']);
  expect(pyResolve.resolvePythonModule('b.bar', 'src/a/foo.py', (p) => clean.has(p))).toBe('src/b/bar.py');
});
