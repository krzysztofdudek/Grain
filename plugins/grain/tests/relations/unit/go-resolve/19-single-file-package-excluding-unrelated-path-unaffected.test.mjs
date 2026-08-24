import { test } from 'node:test';
import { expect, goResolve } from '../_unit-harness.mjs';

const deps = {
  modulePathFor: () => ({ modulePath: 'example.com/m', moduleDir: '' }),
  dirExists: (d) => d === 'foo/bar' || d === '',
  goFilesIn: (d) =>
    d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : d === '' ? ['main.go'] : [],
};

test('a single-file package excluding an UNRELATED path elsewhere is unaffected', () => {
  // isExcluded here answers true for a path outside this package directory
  // entirely — the package's own only file is never excluded, so resolution
  // is byte-identical to the no-exclusion case above.
  const singleFileUnrelatedExcluded = {
    ...deps,
    goFilesIn: (d) => (d === 'foo/bar' ? ['foo/bar/only.go'] : []),
    ownerOf: (f) => (f === 'foo/bar/only.go' ? 'x' : undefined),
    isExcluded: (f) => f === 'somewhere/else/entirely.go',
  };
  expect(goResolve.resolveGoImport('example.com/m/foo/bar', 'foo/x.go', singleFileUnrelatedExcluded)).toBe('foo/bar/only.go');
});
