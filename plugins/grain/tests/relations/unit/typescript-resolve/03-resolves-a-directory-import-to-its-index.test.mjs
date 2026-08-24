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

test('resolves a directory import to its index', () => {
  expect(tsResolve.resolveTsPath('../util', 'src/core/x.ts', exists)).toBe('src/util/index.ts');
});
