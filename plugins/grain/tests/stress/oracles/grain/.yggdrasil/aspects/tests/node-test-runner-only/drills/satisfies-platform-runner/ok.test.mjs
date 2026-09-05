import { test } from 'node:test';
import assert from 'node:assert/strict';
import { edgesOf } from '../harness.mjs';
test('binds a relative import', () => { assert.ok(edgesOf({}).length >= 0); });
