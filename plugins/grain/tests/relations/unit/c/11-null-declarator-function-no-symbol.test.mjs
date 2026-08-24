import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const cExtractor = extractorForLanguage('c');
const run = (code, ext = '.c') => runExtractor(cExtractor, 'c', ext, code);

test('emits no symbol for a function whose declarator never reaches a function_declarator', async () => {
  // `int (void) { ... }` parses as a function_definition whose declarator chain is a
  // parenthesized_declarator that drills to null before any function_declarator — so
  // functionName() returns undefined (no name to emit) and a real, named neighbour is
  // still captured. Exercises the declarator===null branch.
  const { declarations } = await run('int (void) { return 0; }\nint named(void) { return 1; }\n');
  const keys = declarations.map((d) => d.symbolKey);
  expect(keys).toContain('named');
  // The anonymous/abstract function produced no symbol of its own.
  expect(keys).not.toContain('void');
});
