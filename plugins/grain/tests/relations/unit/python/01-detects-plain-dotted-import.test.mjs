import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code) => runExtractor(extractorForLanguage('python'), 'python', '.py', code);

test('detects a plain `import a.b` as the dotted module hint', async () => {
  const { uses } = await run('import foo.bar');
  expect(uses).toContainEqual(
    expect.objectContaining({ candidates: [{ kind: 'path', specifier: 'foo.bar' }], kind: 'import' }),
  );
});
