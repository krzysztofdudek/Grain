import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

test('keeps an empty prefix key (Composer\'s fallback directory)', () => {
  expect(phpResolve.parsePsr4('{ "autoload": { "psr-4": { "": "src/" } } }', '').get('')).toEqual(['src']);
});
