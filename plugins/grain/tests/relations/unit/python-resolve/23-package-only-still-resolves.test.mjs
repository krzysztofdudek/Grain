import { test } from 'node:test';
import { expect, pyResolve } from '../_unit-harness.mjs';

test('a package with no same-named module file still resolves via __init__.py', () => {
  const soloPackage = new Set(['solo/__init__.py']);
  expect(pyResolve.resolvePythonModule('solo', 'x.py', (p) => soloPackage.has(p))).toBe('solo/__init__.py');
});
