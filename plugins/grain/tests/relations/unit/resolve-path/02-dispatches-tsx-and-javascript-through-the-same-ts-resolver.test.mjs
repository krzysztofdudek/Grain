import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('dispatches tsx and javascript through the same TS resolver', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'resolve-path-'));
  mkdirSync(path.join(root, 'src', 'b'), { recursive: true });
  writeFileSync(path.join(root, 'src', 'b', 'bar.ts'), 'export const bar = 1;\n', 'utf-8');
  try {
    const resolve = makeResolvePathToFile(root);
    expect(resolve('../b/bar.js', 'src/a/foo.tsx', 'tsx')).toBe('src/b/bar.ts');
    expect(resolve('../b/bar.js', 'src/a/foo.js', 'javascript')).toBe('src/b/bar.ts');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
