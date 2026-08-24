import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

// The Go resolver maps an import PATH → a package directory → a representative
// `.go` file. It reads go.mod for the module path and lists the package directory
// on disk, so this test builds a real temp repo and cleans it up in `finally`.
// Driven through the production makeResolvePathToFile (disk-backed go.mod + readdir).

test('resolves an in-module import path to a representative .go file in its directory', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'go-resolve-'));
  try {
    // module example.com/m, with a package at foo/bar containing baz.go.
    writeFileSync(path.join(root, 'go.mod'), 'module example.com/m\n\ngo 1.22\n', 'utf-8');
    mkdirSync(path.join(root, 'foo', 'bar'), { recursive: true });
    writeFileSync(path.join(root, 'foo', 'bar', 'baz.go'), 'package bar\n', 'utf-8');

    const resolve = makeResolvePathToFile(root);
    expect(resolve('example.com/m/foo/bar', 'foo/app/main.go', 'go')).toBe('foo/bar/baz.go');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
