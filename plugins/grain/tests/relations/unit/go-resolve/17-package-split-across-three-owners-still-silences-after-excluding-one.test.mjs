import { test } from 'node:test';
import { expect, goResolve } from '../_unit-harness.mjs';

const deps = {
  modulePathFor: () => ({ modulePath: 'example.com/m', moduleDir: '' }),
  dirExists: (d) => d === 'foo/bar' || d === '',
  goFilesIn: (d) =>
    d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : d === '' ? ['main.go'] : [],
};

test('a package split across THREE distinct owners still silences the import after excluding one member', () => {
  // foo/bar holds three files owned by three different nodes. Excluding one
  // still leaves two distinct owners among what remains — genuinely still
  // split, so the import must stay silent, not collapse to either survivor.
  const threeWaySplit = {
    ...deps,
    goFilesIn: (d) => (d === 'foo/bar' ? ['foo/bar/aux.go', 'foo/bar/baz.go', 'foo/bar/qux.go'] : []),
    ownerOf: (f) =>
      f === 'foo/bar/aux.go' ? 'x' : f === 'foo/bar/baz.go' ? 'y' : f === 'foo/bar/qux.go' ? 'z' : undefined,
    isExcluded: (f) => f === 'foo/bar/aux.go',
  };
  expect(goResolve.resolveGoImport('example.com/m/foo/bar', 'foo/x.go', threeWaySplit)).toBeUndefined();
});
