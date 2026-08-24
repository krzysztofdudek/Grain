import { test } from 'node:test';
import { expect, phpResolve } from '../_unit-harness.mjs';

test('returns an empty map for malformed JSON', () => {
  expect(phpResolve.parsePsr4('{ not json', '').size).toBe(0);
});
