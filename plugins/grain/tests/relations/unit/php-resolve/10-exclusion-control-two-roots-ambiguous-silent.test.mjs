import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

const FROM = 'src/Order/Handler.php';

// One prefix, two base directories, the same class file present under both —
// a genuine PSR-4 ambiguity (2 hits) that stays silent when nothing is
// excluded. Marking one hit as graph-excluded must drop it from the ambiguity
// count BEFORE the exactly-one-hit decision, the same drop-then-decide rule
// the Go/Java package resolvers already apply to a split package's file list.
const twoRootPsr4 = new Map([['App\\', ['src1', 'src2']]]);
const twoRootFiles = new Set(['src1/Svc/S1.php', 'src2/Svc/S1.php']);

test('control: with nothing excluded, two distinct roots stay ambiguous — silent', () => {
  const deps = { psr4For: () => twoRootPsr4, exists: (p) => twoRootFiles.has(p) };
  expect(phpResolve.resolvePhpFqn('App\\Svc\\S1', FROM, deps)).toBeUndefined();
});
