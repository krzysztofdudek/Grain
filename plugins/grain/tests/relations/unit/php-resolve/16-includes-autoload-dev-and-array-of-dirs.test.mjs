import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

test('includes autoload-dev and an array of directories', () => {
  const map = phpResolve.parsePsr4(
    '{ "autoload": { "psr-4": { "App\\\\": ["src/", "lib/"] } }, "autoload-dev": { "psr-4": { "App\\\\Tests\\\\": "tests/" } } }',
    '',
  );
  expect(map.get('App\\')).toEqual(['src', 'lib']);
  expect(map.get('App\\Tests\\')).toEqual(['tests']);
});
