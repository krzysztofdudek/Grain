import { test } from 'node:test';
import { expect, pyResolve } from '../_unit-harness.mjs';

// Same shadow shape as the "own dir shadows a genuine root" test above: two
// ancestor roots each hold a file matching the same dotted module, so the
// absolute resolver treats it as genuinely ambiguous and stays silent. An
// `isExcluded` predicate that marks one of the two matches as graph-excluded
// must drop it from the ambiguity count BEFORE the silence decision, the same
// drop-then-decide rule the Go/Java package resolvers already apply.
const shadow = new Set(['src/a/b.py', 'src/b/bar.py']);
const shadowExists = (p) => shadow.has(p);

test('excluding an UNRELATED path elsewhere leaves a genuinely ambiguous resolution silent', () => {
  const isExcluded = (p) => p === 'somewhere/else/entirely.py';
  expect(
    pyResolve.resolvePythonModule('b.bar', 'src/a/b.py', shadowExists, isExcluded),
  ).toBeUndefined();
});
