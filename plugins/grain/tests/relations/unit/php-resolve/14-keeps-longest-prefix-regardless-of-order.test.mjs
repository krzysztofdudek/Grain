import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

const FROM = 'src/Order/Handler.php';

test('keeps the longest prefix even when a shorter one is encountered after it', () => {
  // Iteration order puts the longer prefix first, then the shorter — the shorter
  // must NOT overwrite the already-chosen longer best.
  const ordered = {
    psr4For: () =>
      new Map([
        ['App\\Tests\\', ['tests']],
        ['App\\', ['src']],
      ]),
    exists: (p) => p === 'tests/Unit/GatewayTest.php',
  };
  expect(phpResolve.resolvePhpFqn('App\\Tests\\Unit\\GatewayTest', FROM, ordered)).toBe('tests/Unit/GatewayTest.php');
});
