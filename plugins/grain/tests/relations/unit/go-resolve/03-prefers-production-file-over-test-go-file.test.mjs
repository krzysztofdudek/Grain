import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('prefers a production file over a *_test.go file', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'go-resolve-'));
  try {
    writeFileSync(path.join(root, 'go.mod'), 'module example.com/m\n\ngo 1.22\n', 'utf-8');
    // A package directory with a production + test file — production must win.
    mkdirSync(path.join(root, 'foo', 'mixed'), { recursive: true });
    writeFileSync(path.join(root, 'foo', 'mixed', 'a.go'), 'package mixed\n', 'utf-8');
    writeFileSync(path.join(root, 'foo', 'mixed', 'a_test.go'), 'package mixed\n', 'utf-8');

    const resolve = makeResolvePathToFile(root);
    expect(resolve('example.com/m/foo/mixed', 'foo/app/main.go', 'go')).toBe('foo/mixed/a.go');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
