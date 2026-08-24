import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

test('returns an empty map when the JSON is not an object (e.g. `null`)', () => {
  expect(phpResolve.parsePsr4('null', '').size).toBe(0);
  expect(phpResolve.parsePsr4('42', '').size).toBe(0);
});
