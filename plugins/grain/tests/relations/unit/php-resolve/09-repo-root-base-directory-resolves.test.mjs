import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

const FROM = 'src/Order/Handler.php';

test('resolves under a PSR-4 prefix whose base directory is the repo root ("")', () => {
  // baseDir '' means the class file sits at the repo root sub-path directly.
  const rootDeps = {
    psr4For: () => new Map([['Root\\', ['']]]),
    exists: (p) => p === 'Lib/Thing.php',
  };
  expect(phpResolve.resolvePhpFqn('Root\\Lib\\Thing', FROM, rootDeps)).toBe('Lib/Thing.php');
});
