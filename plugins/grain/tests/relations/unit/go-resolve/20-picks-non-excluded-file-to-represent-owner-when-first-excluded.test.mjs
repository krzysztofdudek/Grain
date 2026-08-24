import { test } from 'node:test';
import { expect, goResolve } from '../_unit-harness.mjs';

const deps = {
  modulePathFor: () => ({ modulePath: 'example.com/m', moduleDir: '' }),
  dirExists: (d) => d === 'foo/bar' || d === '',
  goFilesIn: (d) =>
    d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : d === '' ? ['main.go'] : [],
};

test('picks a NON-EXCLUDED file to represent a single owner when the lexicographically-first one is excluded', () => {
  // Both files belong to node "x" (single owner, not split). aux.go sorts
  // first and would normally be the representative, but it is excluded —
  // the representative must shift to the other file the SAME owner maps
  // (baz.go), never fall through to "no representative".
  const oneOwnerFirstExcluded = {
    ...deps,
    goFilesIn: (d) => (d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : []),
    ownerOf: () => 'x',
    isExcluded: (f) => f === 'foo/bar/aux.go',
  };
  expect(goResolve.resolveGoImport('example.com/m/foo/bar', 'foo/x.go', oneOwnerFirstExcluded)).toBe('foo/bar/baz.go');
});
