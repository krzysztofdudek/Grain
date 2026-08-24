import { test } from 'node:test';
import { expect, goResolve } from '../_unit-harness.mjs';

const deps = {
  modulePathFor: () => ({ modulePath: 'example.com/m', moduleDir: '' }),
  dirExists: (d) => d === 'foo/bar' || d === '',
  goFilesIn: (d) =>
    d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : d === '' ? ['main.go'] : [],
};

test('excluding the split package member that sorts LAST attributes the import to whichever owner is left', () => {
  // Mirror of the FIRST case: baz.go (owner x, sorts last) is excluded this
  // time, leaving aux.go (owner y) as the sole remaining owner.
  const splitLastExcluded = {
    ...deps,
    goFilesIn: (d) => (d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : []),
    ownerOf: (f) => (f === 'foo/bar/aux.go' ? 'y' : f === 'foo/bar/baz.go' ? 'x' : undefined),
    isExcluded: (f) => f === 'foo/bar/baz.go',
  };
  expect(goResolve.resolveGoImport('example.com/m/foo/bar', 'foo/x.go', splitLastExcluded)).toBe('foo/bar/aux.go');
});
