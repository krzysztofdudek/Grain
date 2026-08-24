import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('returns undefined for a non-TS language (symbol-resolved or not yet implemented)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'resolve-path-'));
  mkdirSync(path.join(root, 'src', 'b'), { recursive: true });
  writeFileSync(path.join(root, 'src', 'b', 'bar.ts'), 'export const bar = 1;\n', 'utf-8');
  try {
  // Even a specifier that would resolve under TS is ignored for other languages.
    const resolve = makeResolvePathToFile(root);
    expect(resolve('../b/bar.js', 'src/a/foo.py', 'python')).toBeUndefined();
    expect(resolve('../b/bar.js', 'src/a/foo.go', 'go')).toBeUndefined();
    expect(resolve('../b/bar.js', 'src/a/foo.x', '')).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
