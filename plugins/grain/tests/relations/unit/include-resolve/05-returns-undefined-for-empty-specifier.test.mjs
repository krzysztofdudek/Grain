import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('returns undefined for an empty specifier', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'c-include-resolve-'));
  try {
    mkdirSync(path.join(root, 'src', 'a'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'a', 'foo.c'), '#include "../inc/bar.h"\n', 'utf-8');

    const resolve = makeResolvePathToFile(root);
    expect(resolve('', 'src/a/foo.c', 'c')).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
