import { test } from 'node:test';
import { expect, goResolve } from '../_unit-harness.mjs';

const deps = {
  modulePathFor: () => ({ modulePath: 'example.com/m', moduleDir: '' }),
  dirExists: (d) => d === 'foo/bar' || d === '',
  goFilesIn: (d) =>
    d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : d === '' ? ['main.go'] : [],
};

test('excluding the split package member that sorts FIRST attributes the import to whichever owner is left', () => {
  // foo/bar holds aux.go (owner y, sorts first) and baz.go (owner x, sorts
  // last) — a real two-owner split. Dropping the excluded file BEFORE deciding
  // ownership means the decision is made over what remains: only baz.go is
  // left, owned solely by x, so the import now attributes to x's own file —
  // the exclusion removed aux.go from consideration and nothing else; it did
  // not invent an owner x never had, and it did not bury the real dependency
  // the package's other, non-excluded file still justifies.
  const splitFirstExcluded = {
    ...deps,
    goFilesIn: (d) => (d === 'foo/bar' ? ['foo/bar/baz.go', 'foo/bar/aux.go'] : []),
    ownerOf: (f) => (f === 'foo/bar/aux.go' ? 'y' : f === 'foo/bar/baz.go' ? 'x' : undefined),
    isExcluded: (f) => f === 'foo/bar/aux.go',
  };
  expect(goResolve.resolveGoImport('example.com/m/foo/bar', 'foo/x.go', splitFirstExcluded)).toBe('foo/bar/baz.go');
});
