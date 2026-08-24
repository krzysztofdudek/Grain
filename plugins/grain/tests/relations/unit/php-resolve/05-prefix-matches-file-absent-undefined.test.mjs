import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

const files = new Set(['src/Payment/Gateway.php', 'src/Order/Handler.php', 'tests/Unit/GatewayTest.php']);
const psr4 = new Map([
  ['App\\', ['src']],
  ['App\\Tests\\', ['tests']],
]);
const deps = { psr4For: () => psr4, exists: (p) => files.has(p) };
const FROM = 'src/Order/Handler.php';

test('returns undefined when the prefix matches but the file is absent', () => {
  expect(phpResolve.resolvePhpFqn('App\\Nope\\Missing', FROM, deps)).toBeUndefined();
});
