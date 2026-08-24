import { test } from 'node:test';
import { expect, goResolve } from '../_unit-harness.mjs';

const deps = {
  modulePathFor: () => ({ modulePath: 'example.com/m', moduleDir: '' }),
  dirExists: (d) => d === 'foo/bar' || d === '',
  goFilesIn: (d) =>
    d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : d === '' ? ['main.go'] : [],
};

test('picks the lexicographically-first .go file deterministically', () => {
  // aux.go sorts before baz.go → stable representative choice.
  expect(goResolve.resolveGoImport('example.com/m/foo/bar', 'foo/x.go', deps)).toBe('foo/bar/aux.go');
});
