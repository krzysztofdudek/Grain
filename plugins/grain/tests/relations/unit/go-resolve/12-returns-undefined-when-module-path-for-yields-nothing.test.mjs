import { test } from 'node:test';
import { expect, goResolve } from '../_unit-harness.mjs';

const deps = {
  modulePathFor: () => ({ modulePath: 'example.com/m', moduleDir: '' }),
  dirExists: (d) => d === 'foo/bar' || d === '',
  goFilesIn: (d) =>
    d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : d === '' ? ['main.go'] : [],
};

test('returns undefined when modulePathFor yields nothing', () => {
  const noMod = { ...deps, modulePathFor: () => undefined };
  expect(goResolve.resolveGoImport('example.com/m/foo/bar', 'foo/x.go', noMod)).toBeUndefined();
});
