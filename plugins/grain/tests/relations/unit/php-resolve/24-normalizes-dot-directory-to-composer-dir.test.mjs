import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

test('normalizes a "." directory to the composer dir itself', () => {
  expect(phpResolve.parsePsr4('{ "autoload": { "psr-4": { "App\\\\": "." } } }', '').get('App\\')).toEqual(['']);
  expect(
    phpResolve.parsePsr4('{ "autoload": { "psr-4": { "App\\\\": "." } } }', 'packages/core').get('App\\'),
  ).toEqual(['packages/core']);
});
