import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('falls back to a *_test.go file when the directory has only tests', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'go-resolve-'));
  try {
    writeFileSync(path.join(root, 'go.mod'), 'module example.com/m\n\ngo 1.22\n', 'utf-8');
    // A package directory with ONLY a test file.
    mkdirSync(path.join(root, 'foo', 'onlytest'), { recursive: true });
    writeFileSync(path.join(root, 'foo', 'onlytest', 'x_test.go'), 'package onlytest\n', 'utf-8');

    const resolve = makeResolvePathToFile(root);
    expect(resolve('example.com/m/foo/onlytest', 'foo/app/main.go', 'go')).toBe(
      'foo/onlytest/x_test.go',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
