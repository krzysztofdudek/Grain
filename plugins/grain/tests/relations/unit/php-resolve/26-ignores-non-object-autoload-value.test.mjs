import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

test('ignores an autoload value that is not an object', () => {
  expect(phpResolve.parsePsr4('{ "autoload": "nope" }', '').size).toBe(0);
});
