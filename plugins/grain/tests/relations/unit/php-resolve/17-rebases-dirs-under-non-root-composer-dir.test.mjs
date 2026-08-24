import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

test('rebases directories under a non-root composer dir', () => {
  const map = phpResolve.parsePsr4('{ "autoload": { "psr-4": { "App\\\\": "src/" } } }', 'packages/core');
  expect(map.get('App\\')).toEqual(['packages/core/src']);
});
