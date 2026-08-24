import { test } from 'node:test';
import { expect, goResolve } from '../_unit-harness.mjs';

const deps = {
  modulePathFor: () => ({ modulePath: 'example.com/m', moduleDir: '' }),
  dirExists: (d) => d === 'foo/bar' || d === '',
  goFilesIn: (d) =>
    d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : d === '' ? ['main.go'] : [],
};

test("falls back to the sole owner's own file (never a different owner's) when EVERY one of its files is excluded", () => {
  const allExcluded = {
    ...deps,
    goFilesIn: (d) => (d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : []),
    ownerOf: () => 'x',
    isExcluded: () => true,
  };
  // Still names one of x's own files (never undefined, never a fabricated
  // owner) — the downstream, exclusion-guarded owner lookup on that file is
  // what actually silences the edge, the same as a wholly-excluded package.
  expect(goResolve.resolveGoImport('example.com/m/foo/bar', 'foo/x.go', allExcluded)).toBe('foo/bar/aux.go');
});
