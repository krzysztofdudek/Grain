import { test } from 'node:test';
import { expect, extractorForLanguage } from '../_unit-harness.mjs';

test('resolves the Rust extractor (crate module-tree resolved)', () => {
  expect(extractorForLanguage('rust')).toBeDefined();
});
