import { test } from 'node:test';
import { expect, pyResolve } from '../_unit-harness.mjs';

test('a module file with no same-named package still resolves', () => {
  const soloModule = new Set(['solo.py']);
  expect(pyResolve.resolvePythonModule('solo', 'x.py', (p) => soloModule.has(p))).toBe('solo.py');
});
