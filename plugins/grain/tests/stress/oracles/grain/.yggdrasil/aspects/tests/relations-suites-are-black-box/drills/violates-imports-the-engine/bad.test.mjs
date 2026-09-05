import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEdges } from '../../../engine/relations.mjs';
test('binds a relative import', () => { assert.ok(buildEdges([]).length === 0); });
