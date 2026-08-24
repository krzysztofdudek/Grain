import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('returns undefined for an in-module path whose directory has no .go file', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'go-resolve-'));
  try {
    writeFileSync(path.join(root, 'go.mod'), 'module example.com/m\n\ngo 1.22\n', 'utf-8');
    // An empty package directory (exists but no .go file).
    mkdirSync(path.join(root, 'foo', 'empty'), { recursive: true });

    const resolve = makeResolvePathToFile(root);
    expect(resolve('example.com/m/foo/empty', 'foo/app/main.go', 'go')).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
