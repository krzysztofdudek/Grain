import { test } from 'node:test';
import { expect, tsResolve } from '../_unit-harness.mjs';

// `exists` predicate over a fixed set of repo-relative POSIX files.
const known = new Set([
  'src/io/graph-fs.ts',
  'src/util/u.ts',
  'src/util/index.ts',
  'src/a/b.tsx',
  'src/m/m.js',
  'src/comp/widget.tsx',
]);
const exists = (p) => known.has(p);

test('uses an explicit .tsx extension as-is', () => {
  expect(tsResolve.resolveTsPath('../comp/widget.tsx', 'src/core/x.ts', exists)).toBe(
    'src/comp/widget.tsx',
  );
});
