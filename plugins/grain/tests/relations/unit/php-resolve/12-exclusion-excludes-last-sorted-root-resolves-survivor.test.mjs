import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

const FROM = 'src/Order/Handler.php';
const twoRootPsr4 = new Map([['App\\', ['src1', 'src2']]]);
const twoRootFiles = new Set(['src1/Svc/S1.php', 'src2/Svc/S1.php']);

test('excluding the root that sorts LAST resolves to the survivor', () => {
  const deps = {
    psr4For: () => twoRootPsr4,
    exists: (p) => twoRootFiles.has(p),
    isExcluded: (p) => p === 'src2/Svc/S1.php',
  };
  expect(phpResolve.resolvePhpFqn('App\\Svc\\S1', FROM, deps)).toBe('src1/Svc/S1.php');
});
