import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

const files = new Set(['src/Payment/Gateway.php', 'src/Order/Handler.php', 'tests/Unit/GatewayTest.php']);
const psr4 = new Map([
  ['App\\', ['src']],
  ['App\\Tests\\', ['tests']],
]);
const deps = { psr4For: () => psr4, exists: (p) => files.has(p) };
const FROM = 'src/Order/Handler.php';

test('does not match a prefix that is only a string-prefix, not a namespace boundary', () => {
  // `Apple\X` must NOT match the `App\` prefix.
  expect(phpResolve.resolvePhpFqn('Apple\\Thing', FROM, deps)).toBeUndefined();
});
