import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cppExtractor = extractorForLanguage('cpp');
const run = (code, ext = '.cpp') => runExtractor(cppExtractor, 'cpp', ext, code);

test('emits no symbol for a reference-return function whose declarator drills to null', async () => {
  // `int& r(int& x) { ... }` parses with a reference_declarator that drills to null
  // before any function_declarator is reached → functionName() returns undefined.
  // A plainly-named neighbour is still captured. Exercises the declarator===null
  // branch in the cpp functionName helper.
  const { declarations } = await run('int& r(int& x) { return x; }\nvoid plain() {}\n');
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('plain');
  expect(keys).not.toContain('r');
});
