import { test } from 'node:test';
import { expect, pyResolve } from '../_unit-harness.mjs';

// `from .mod import X` from src/a/x.py: base 'src/a', tailPath 'mod', candidates
// 'src/a/mod/__init__.py' (package) then 'src/a/mod.py' (module) — the same
// package-then-module priority the absolute resolver uses (verified against the
// real interpreter — see the absolute resolver's own shadow tests above).
const shadow = new Set(['src/a/mod.py', 'src/a/mod/__init__.py']);
const shadowExists = (p) => shadow.has(p);

test('excluding the module-as-file leaves the package resolution unaffected', () => {
  const isExcluded = (p) => p === 'src/a/mod.py';
  expect(pyResolve.resolvePythonModule('.mod', 'src/a/x.py', shadowExists, isExcluded)).toBe(
    'src/a/mod/__init__.py',
  );
});
