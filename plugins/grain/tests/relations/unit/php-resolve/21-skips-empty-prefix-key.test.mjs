import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

test('skips an empty prefix key (PSR-4 forbids it)', () => {
  expect(phpResolve.parsePsr4('{ "autoload": { "psr-4": { "": "src/" } } }', '').size).toBe(0);
});
