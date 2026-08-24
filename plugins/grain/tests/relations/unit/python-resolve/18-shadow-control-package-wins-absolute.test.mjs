import { test } from 'node:test';
import { expect, pyResolve } from '../_unit-harness.mjs';

// ONE source root holds both a module file (mod.py) and a same-named package
// (mod/__init__.py). Verified against the real interpreter (python3 -c "import
// lib.mod" with both lib/mod.py and lib/mod/__init__.py present loads the
// __init__.py): CPython imports the PACKAGE — a regular package outranks a
// same-named module file at the same root. The per-root candidate list tries
// the package form first, then the module form, and does not stop at the first
// EXISTING candidate regardless of exclusion, so excluding the package falls
// through to the live module file at the very same root.
const shadow = new Set(['mod.py', 'mod/__init__.py']);
const shadowExists = (p) => shadow.has(p);

test('control: with nothing excluded, the package candidate wins over the module-as-file — matches CPython', () => {
  expect(pyResolve.resolvePythonModule('mod', 'x.py', shadowExists)).toBe('mod/__init__.py');
});
