import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

test('parses autoload.psr-4 with directories relative to the composer dir', () => {
  const map = phpResolve.parsePsr4('{ "autoload": { "psr-4": { "App\\\\": "src/" } } }', '');
  expect([...map.entries()]).toEqual([['App\\', ['src']]]);
});
