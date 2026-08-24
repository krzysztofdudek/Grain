import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

const FROM = 'src/Order/Handler.php';

test('returns undefined when the PSR-4 map is empty (no composer.json)', () => {
  const empty = { psr4For: () => new Map(), exists: () => true };
  expect(phpResolve.resolvePhpFqn('App\\Payment\\Gateway', FROM, empty)).toBeUndefined();
});
