import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('returns undefined for a bare/external specifier', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'resolve-path-'));
  mkdirSync(path.join(root, 'src', 'b'), { recursive: true });
  writeFileSync(path.join(root, 'src', 'b', 'bar.ts'), 'export const bar = 1;\n', 'utf-8');
  try {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('zod', 'src/a/foo.ts', 'typescript')).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
