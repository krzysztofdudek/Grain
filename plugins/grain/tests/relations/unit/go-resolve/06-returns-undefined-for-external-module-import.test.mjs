import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('returns undefined for an external module import (not under the module path)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'go-resolve-'));
  try {
    writeFileSync(path.join(root, 'go.mod'), 'module example.com/m\n\ngo 1.22\n', 'utf-8');

    const resolve = makeResolvePathToFile(root);
    expect(resolve('github.com/gorilla/mux', 'foo/app/main.go', 'go')).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
