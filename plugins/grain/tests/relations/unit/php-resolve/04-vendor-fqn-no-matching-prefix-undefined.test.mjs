import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

const files = new Set(['src/Payment/Gateway.php', 'src/Order/Handler.php', 'tests/Unit/GatewayTest.php']);
const psr4 = new Map([
  ['App\\', ['src']],
  ['App\\Tests\\', ['tests']],
]);
const deps = { psr4For: () => psr4, exists: (p) => files.has(p) };
const FROM = 'src/Order/Handler.php';

test('returns undefined for a vendor FQN with no matching prefix', () => {
  expect(phpResolve.resolvePhpFqn('Psr\\Log\\LoggerInterface', FROM, deps)).toBeUndefined();
});
