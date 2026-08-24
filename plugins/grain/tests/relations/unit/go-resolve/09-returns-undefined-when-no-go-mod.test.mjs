import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('returns undefined when there is no go.mod (module path unknown)', () => {
  const noMod = mkdtempSync(path.join(tmpdir(), 'go-nomod-'));
  try {
    mkdirSync(path.join(noMod, 'foo', 'bar'), { recursive: true });
    writeFileSync(path.join(noMod, 'foo', 'bar', 'baz.go'), 'package bar\n', 'utf-8');
    const resolve = makeResolvePathToFile(noMod);
    expect(resolve('example.com/m/foo/bar', 'foo/app/main.go', 'go')).toBeUndefined();
  } finally {
    rmSync(noMod, { recursive: true, force: true });
  }
});
