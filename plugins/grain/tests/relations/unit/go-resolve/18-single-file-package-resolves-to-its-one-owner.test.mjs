import { test } from 'node:test';
import { expect, goResolve } from '../_unit-harness.mjs';

const deps = {
  modulePathFor: () => ({ modulePath: 'example.com/m', moduleDir: '' }),
  dirExists: (d) => d === 'foo/bar' || d === '',
  goFilesIn: (d) =>
    d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : d === '' ? ['main.go'] : [],
};

test('a single-file package resolves to its one owner when nothing is excluded', () => {
  const singleFile = {
    ...deps,
    goFilesIn: (d) => (d === 'foo/bar' ? ['foo/bar/only.go'] : []),
    ownerOf: (f) => (f === 'foo/bar/only.go' ? 'x' : undefined),
  };
  expect(goResolve.resolveGoImport('example.com/m/foo/bar', 'foo/x.go', singleFile)).toBe('foo/bar/only.go');
});
