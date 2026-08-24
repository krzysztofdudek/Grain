import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

const FROM = 'src/Order/Handler.php';
const twoRootPsr4 = new Map([['App\\', ['src1', 'src2']]]);
const twoRootFiles = new Set(['src1/Svc/S1.php', 'src2/Svc/S1.php']);

test('excluding an UNRELATED file elsewhere leaves a genuinely ambiguous resolution silent', () => {
  const deps = {
    psr4For: () => twoRootPsr4,
    exists: (p) => twoRootFiles.has(p),
    isExcluded: (p) => p === 'somewhere/else/entirely.php',
  };
  expect(phpResolve.resolvePhpFqn('App\\Svc\\S1', FROM, deps)).toBeUndefined();
});
