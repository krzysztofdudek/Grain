import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

test('normalizes a directory that resolves back to the composer dir to "" ', () => {
  // "sub/.." normalizes to "." → the repo root, rendered as the empty string.
  expect(phpResolve.parsePsr4('{ "autoload": { "psr-4": { "App\\\\": "sub/.." } } }', '').get('App\\')).toEqual(['']);
});
