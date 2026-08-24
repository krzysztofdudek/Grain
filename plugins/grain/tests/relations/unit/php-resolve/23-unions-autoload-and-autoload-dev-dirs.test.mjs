import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

test('unions directories across autoload and autoload-dev without duplicating', () => {
  // The same prefix maps to "src/" in both sections — the result keeps one entry.
  const map = phpResolve.parsePsr4(
    '{ "autoload": { "psr-4": { "App\\\\": "src/" } }, "autoload-dev": { "psr-4": { "App\\\\": "src/" } } }',
    '',
  );
  expect(map.get('App\\')).toEqual(['src']);
});
