import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('does not confuse a prefix that is not a path boundary (modulePath + non-slash)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'go-resolve-'));
  try {
    writeFileSync(path.join(root, 'go.mod'), 'module example.com/m\n\ngo 1.22\n', 'utf-8');
    mkdirSync(path.join(root, 'foo', 'bar'), { recursive: true });
    writeFileSync(path.join(root, 'foo', 'bar', 'baz.go'), 'package bar\n', 'utf-8');

    // import path `example.com/main` shares the textual prefix `example.com/m`
    // but is NOT under module `example.com/m` (next char is not `/`) → silence.
    const resolve = makeResolvePathToFile(root);
    expect(resolve('example.com/main', 'foo/app/main.go', 'go')).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
