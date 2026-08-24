import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('resolves the module path itself to a .go file at the module root', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'go-resolve-'));
  try {
    writeFileSync(path.join(root, 'go.mod'), 'module example.com/m\n\ngo 1.22\n', 'utf-8');
    // The module root itself holds a .go file (for the module-root import case).
    writeFileSync(path.join(root, 'main.go'), 'package main\n', 'utf-8');

    const resolve = makeResolvePathToFile(root);
    expect(resolve('example.com/m', 'foo/app/main.go', 'go')).toBe('main.go');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
