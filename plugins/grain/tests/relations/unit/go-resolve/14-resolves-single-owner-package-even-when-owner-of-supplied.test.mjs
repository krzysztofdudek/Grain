import { test } from 'node:test';
import { expect, goResolve } from '../_unit-harness.mjs';

const deps = {
  modulePathFor: () => ({ modulePath: 'example.com/m', moduleDir: '' }),
  dirExists: (d) => d === 'foo/bar' || d === '',
  goFilesIn: (d) =>
    d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : d === '' ? ['main.go'] : [],
};

test('resolves a single-owner package even when ownerOf is supplied (positive)', () => {
  // Both files in foo/bar belong to node "x" → one owner → attribute the
  // representative (lexicographically-first production file, aux.go).
  const oneOwner = {
    ...deps,
    goFilesIn: (d) => (d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : []),
    ownerOf: () => 'x',
  };
  expect(goResolve.resolveGoImport('example.com/m/foo/bar', 'foo/x.go', oneOwner)).toBe('foo/bar/aux.go');
});
