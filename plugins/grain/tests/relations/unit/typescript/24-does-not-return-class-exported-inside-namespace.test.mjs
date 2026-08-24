import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('does NOT return a class exported inside a namespace block (not program top level)', async () => {
  // The class is wrapped in an export_statement whose parent is the namespace body,
  // not `program` — isTopLevel rejects it via the grandparent check.
  const { declarations } = await run(`namespace N { export class Inner {} }`);
  expect(declarations.map((d) => d.symbolKey)).not.toContain('Inner');
});
