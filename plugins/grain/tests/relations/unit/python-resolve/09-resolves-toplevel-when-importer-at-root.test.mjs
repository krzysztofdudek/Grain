import { test } from 'node:test';
import { expect, pyResolve } from '../_unit-harness.mjs';

test('resolves a top-level module when the importing file sits at the repo root', () => {
  // dirname('main.py') === '.', so the ancestor walk starts from the repo root.
  const rootKnown = new Set(['top.py']);
  expect(pyResolve.resolvePythonModule('top', 'main.py', (p) => rootKnown.has(p))).toBe('top.py');
});
