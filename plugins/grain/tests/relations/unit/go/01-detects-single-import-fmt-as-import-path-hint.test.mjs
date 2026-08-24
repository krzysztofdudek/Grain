import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('go'), 'go', '.go', code);

test('detects a single `import "fmt"` as the import-path hint', async () => {
  const { uses } = await run('package main\nimport "fmt"\n');
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: 'fmt' }], kind: 'import' }),
  );
});
