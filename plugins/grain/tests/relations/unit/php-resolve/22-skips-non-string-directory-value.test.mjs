import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

test('skips a non-string directory value inside the array', () => {
  const map = phpResolve.parsePsr4('{ "autoload": { "psr-4": { "App\\\\": ["src/", 123, null] } } }', '');
  expect(map.get('App\\')).toEqual(['src']);
});
