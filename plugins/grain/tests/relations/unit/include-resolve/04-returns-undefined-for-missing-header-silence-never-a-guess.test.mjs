import { test } from 'node:test';
import path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { expect, makeResolvePathToFile } from '../_unit-harness.mjs';

test('returns undefined for a missing header (silence, never a guess)', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'c-include-resolve-'));
  try {
    mkdirSync(path.join(root, 'src', 'a'), { recursive: true });
    writeFileSync(path.join(root, 'src', 'a', 'foo.c'), '#include "../inc/bar.h"\n', 'utf-8');

    const resolve = makeResolvePathToFile(root);
    expect(resolve('../inc/missing.h', 'src/a/foo.c', 'c')).toBeUndefined();
    expect(resolve('nope/absent.h', 'src/a/foo.cpp', 'cpp')).toBeUndefined();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
