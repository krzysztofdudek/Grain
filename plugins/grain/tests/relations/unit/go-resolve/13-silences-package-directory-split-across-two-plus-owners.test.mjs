import { test } from 'node:test';
import { expect, goResolve } from '../_unit-harness.mjs';

const deps = {
  modulePathFor: () => ({ modulePath: 'example.com/m', moduleDir: '' }),
  dirExists: (d) => d === 'foo/bar' || d === '',
  goFilesIn: (d) =>
    d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : d === '' ? ['main.go'] : [],
};

test('silences a package directory split across 2+ owners (F20 package granularity)', () => {
  // foo/bar holds aux.go (owned by node "y") and baz.go (owned by node "x").
  // With an ownerOf that reports a SPLIT package, the import must resolve to
  // nothing — no representative file, no edge — rather than attributing the
  // whole package to whoever owns the lexicographically-first file.
  const split = {
    ...deps,
    goFilesIn: (d) => (d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : []),
    ownerOf: (f) => (f === 'foo/bar/aux.go' ? 'y' : f === 'foo/bar/baz.go' ? 'x' : undefined),
  };
  expect(goResolve.resolveGoImport('example.com/m/foo/bar', 'foo/x.go', split)).toBeUndefined();
});
