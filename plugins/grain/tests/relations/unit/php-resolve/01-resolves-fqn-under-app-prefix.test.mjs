import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

// resolvePhpFqn against a fixed, pure resolution universe.
// PSR-4 map: App\ → src/, App\Tests\ → tests/ (nested prefix → longest-match).
const files = new Set(['src/Payment/Gateway.php', 'src/Order/Handler.php', 'tests/Unit/GatewayTest.php']);
const psr4 = new Map([
  ['App\\', ['src']],
  ['App\\Tests\\', ['tests']],
]);
const deps = { psr4For: () => psr4, exists: (p) => files.has(p) };
const FROM = 'src/Order/Handler.php';

test('resolves an FQN under the App\\ prefix to src/', () => {
  expect(phpResolve.resolvePhpFqn('App\\Payment\\Gateway', FROM, deps)).toBe('src/Payment/Gateway.php');
});
