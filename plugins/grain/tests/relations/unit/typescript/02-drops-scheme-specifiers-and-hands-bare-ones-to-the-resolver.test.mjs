import { test } from 'node:test';
import { expect, runExtractor, extractorForLanguage } from '../_unit-harness.mjs';

const run = (code, ext = '.ts', lang = 'typescript') =>
  runExtractor(extractorForLanguage('typescript'), lang, ext, code);

test('drops scheme specifiers (node builtins, URLs) and hands bare ones to the resolver', async () => {
  // A bare specifier may be a tsconfig alias or an in-repo workspace package, so the resolver decides; a `node:`/`https:` specifier never names a repository file.
  const { uses } = await run(`import path from 'node:path';\nimport { z } from 'zod';\nimport u from 'https://x.dev/u.js';`);
  expect(uses.map((u) => u.candidates[0])).toEqual([{ kind: 'path', specifier: 'zod' }]);
});
