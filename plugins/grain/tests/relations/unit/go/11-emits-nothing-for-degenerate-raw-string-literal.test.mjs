import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('go'), 'go', '.go', code);

test('emits NOTHING for a degenerate (unterminated, sub-2-char) raw-string literal', async () => {
  // A truncated/mid-edit file where the raw-string literal never closes before
  // EOF: tree-sitter's ERROR recovery still yields an `import_spec` with a
  // `raw_string_literal` path node, but its `.text` is just the single opening
  // backtick (length 1) — under the 2-char delimiter-stripping floor, so the
  // path is read as '' rather than slicing into (or past) the delimiter itself.
  const { uses } = await run('package main\nimport `');
  expect(uses).toHaveLength(0);
});
