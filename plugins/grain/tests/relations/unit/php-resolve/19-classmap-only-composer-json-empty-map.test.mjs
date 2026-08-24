import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

test('returns an empty map for a classmap-only composer.json (no psr-4)', () => {
  expect(phpResolve.parsePsr4('{ "autoload": { "classmap": ["src/"] } }', '').size).toBe(0);
});
