import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('resolves to undefined rather than crashing when the nearest go.mod has no module line', () => {
  // A go.mod that exists but carries only a comment — readModulePath's line scan
  // reaches EOF without a `module <path>` match, so resolution falls through to
  // undefined at this dir; with no OTHER go.mod anywhere up to the root, the walk
  // exhausts the tree and resolution is undefined (never a guessed source root).
  const bareRoot = mkdtempSync(path.join(tmpdir(), 'resolve-path-badmod-'));
  try {
    mkdirSync(path.join(bareRoot, 'vendor'), { recursive: true });
    // A non-comment, non-empty line that is NOT a `module <path>` directive —
    // the match attempt runs and misses, unlike a comment/blank line (skipped
    // before the match is even attempted).
    writeFileSync(path.join(bareRoot, 'vendor', 'go.mod'), 'go 1.21\n', 'utf-8');
    writeFileSync(path.join(bareRoot, 'vendor', 'lib.go'), 'package lib\n', 'utf-8');
    const resolve = makeResolvePathToFile(bareRoot);
    expect(resolve('example.com/anything', 'vendor/lib.go', 'go')).toBeUndefined();
  } finally {
    rmSync(bareRoot, { recursive: true, force: true });
  }
});
