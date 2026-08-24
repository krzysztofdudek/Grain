import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

const files = new Set(['src/Payment/Gateway.php', 'src/Order/Handler.php', 'tests/Unit/GatewayTest.php']);
const psr4 = new Map([
  ['App\\', ['src']],
  ['App\\Tests\\', ['tests']],
]);
const deps = { psr4For: () => psr4, exists: (p) => files.has(p) };
const FROM = 'src/Order/Handler.php';

test('returns undefined for a specifier that is only a leading backslash', () => {
  // `\` strips to the empty string before any prefix lookup.
  expect(phpResolve.resolvePhpFqn('\\', FROM, deps)).toBeUndefined();
});
