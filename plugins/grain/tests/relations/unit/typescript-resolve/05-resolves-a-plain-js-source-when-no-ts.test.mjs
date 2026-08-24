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

test('resolves a plain .js source when no .ts exists', () => {
  expect(tsResolve.resolveTsPath('../m/m.js', 'src/core/x.ts', exists)).toBe('src/m/m.js');
});
